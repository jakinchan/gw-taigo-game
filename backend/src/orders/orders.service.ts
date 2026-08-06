import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { OrderStatus, Prisma, ShippingMethod } from '@prisma/client'
import { randomInt } from 'node:crypto'

import { PrismaService } from '../common/prisma/prisma.service'
import { FxService } from '../fx/fx.service'
import { CouponsService } from '../coupons/coupons.service'
import { CreateOrderDto } from './dto/create-order.dto'

/** 送料（分）。閾値以上で無料。 */
const SHIPPING = {
  standard: { fee: 1000, freeThreshold: 19900 },
  express: { fee: 2500, freeThreshold: 49900 },
} as const

/**
 * 越境EC の行郵税。
 * 中国の跨境电商综合税は「関税 0% + 増値税・消費税の 70%」で、
 * 品目により税率が異なる。ここでは健康食品の一般的な税率で概算する。
 * 実運用では商品ごとの HS コードから税率テーブルを引くこと。
 */
const CROSS_BORDER_TAX_RATE = 0.091

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly coupons: CouponsService,
  ) {}

  /**
   * 金額のプレビュー。DB への書き込みは行わない。
   * checkout 画面はこの結果だけを表示する。
   */
  async preview(userId: string, dto: CreateOrderDto) {
    const { lines, address } = await this.resolve(userId, dto)
    const amounts = await this.calculate(userId, lines, dto)

    return {
      id: '',
      orderNo: '',
      status: OrderStatus.pending_payment,
      items: lines.map((line) => ({
        productId: line.product.id,
        sku: line.product.sku,
        name: line.product.name,
        thumbnail: line.product.thumbnail,
        priceCny: line.product.priceCny,
        quantity: line.quantity,
      })),
      amounts,
      address,
      shippingMethod: dto.shippingMethod,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * 注文作成。
   *
   * トランザクション内で FEFO による在庫引き当てまで済ませる。
   * 「在庫を確認してから確保する」を別々のクエリでやると、
   * 同時アクセスで在庫がマイナスになる。updateMany の条件付き更新で
   * 楽観的ロックをかけ、更新件数 0 なら競合として弾く。
   */
  async create(userId: string, dto: CreateOrderDto) {
    const { lines, address } = await this.resolve(userId, dto)
    const amounts = await this.calculate(userId, lines, dto)
    const orderNo = generateOrderNo()

    return this.prisma.$transaction(async (tx) => {
      const allocations: { productId: string; batchNo: string; quantity: number }[] = []

      for (const line of lines) {
        allocations.push(...(await this.allocateFefo(tx, line.product.id, line.quantity)))
      }

      const order = await tx.order.create({
        data: {
          orderNo,
          userId,
          status: OrderStatus.pending_payment,
          addressId: address.id,
          addressSnapshot: address as unknown as Prisma.InputJsonValue,
          shippingMethod: dto.shippingMethod as ShippingMethod,
          remark: dto.remark,

          subtotalCny: amounts.subtotalCny,
          shippingFeeCny: amounts.shippingFeeCny,
          discountCny: amounts.discountCny,
          taxCny: amounts.taxCny,
          totalCny: amounts.totalCny,

          fxRate: amounts.fxRate,
          fxQuotedAt: new Date(amounts.fxQuotedAt),
          totalJpyEstimate: amounts.totalJpyEstimate,
          couponCode: dto.couponCode,

          items: {
            create: lines.map((line) => ({
              productId: line.product.id,
              sku: line.product.sku,
              nameSnapshot: line.product.name as Prisma.InputJsonValue,
              thumbnail: line.product.thumbnail,
              priceCny: line.product.priceCny,
              quantity: line.quantity,
              batchNo:
                allocations.find((a) => a.productId === line.product.id)?.batchNo ?? null,
            })),
          },
        },
        include: { items: true },
      })

      if (dto.couponCode) {
        await this.coupons.markUsed(tx, userId, dto.couponCode, order.id)
      }

      return this.toResponse(order, amounts, address)
    })
  }

  async findAll(userId: string, status?: OrderStatus, page = 1, pageSize = 20) {
    const where: Prisma.OrderWhereInput = { userId, ...(status ? { status } : {}) }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
    ])

    return {
      list: rows.map((row) => this.serialize(row)),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId }, // 他人の注文を ID 直打ちで読めないようにする
      include: { items: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return this.serialize(order)
  }

  /** 未払い注文のキャンセル。確保していた在庫を戻す。 */
  async cancel(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, userId },
        include: { items: true },
      })
      if (!order) throw new NotFoundException('Order not found')
      if (order.status !== OrderStatus.pending_payment) {
        throw new ConflictException('Only unpaid orders can be cancelled')
      }

      for (const item of order.items) {
        if (!item.batchNo) continue
        await tx.stockBatch.updateMany({
          where: { productId: item.productId, batchNo: item.batchNo },
          data: { reserved: { decrement: item.quantity } },
        })
      }

      const updated = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.cancelled },
        include: { items: true },
      })
      return this.serialize(updated)
    })
  }

  // ----------------------------------------------------------
  // 内部処理
  // ----------------------------------------------------------

  /** 商品と住所を実体化し、購入可能かを検証する */
  private async resolve(userId: string, dto: CreateOrderDto) {
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    })
    if (!address) throw new BadRequestException('Address not found')

    const productIds = dto.items.map((item) => item.productId)
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    })

    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products are unavailable')
    }

    const lines = dto.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!
      return { product, quantity: item.quantity }
    })

    return { lines, address }
  }

  /**
   * 金額計算。ここが「請求額の唯一の正本」。
   * クライアントから送られた金額は一切使わない。
   */
  private async calculate(
    userId: string,
    lines: { product: { priceCny: number; isCrossBorder: boolean }; quantity: number }[],
    dto: CreateOrderDto,
  ) {
    const subtotalCny = lines.reduce(
      (sum, line) => sum + line.product.priceCny * line.quantity,
      0,
    )

    const rule = SHIPPING[dto.shippingMethod]
    let shippingFeeCny = subtotalCny >= rule.freeThreshold ? 0 : rule.fee

    // 越境EC 商品の行郵税
    const crossBorderSubtotal = lines
      .filter((line) => line.product.isCrossBorder)
      .reduce((sum, line) => sum + line.product.priceCny * line.quantity, 0)
    const taxCny = Math.round(crossBorderSubtotal * CROSS_BORDER_TAX_RATE)

    // クーポン
    let discountCny = 0
    if (dto.couponCode) {
      const coupon = await this.coupons.validate(userId, dto.couponCode, subtotalCny)
      discountCny = coupon.discountCny
      if (coupon.type === 'shipping') {
        shippingFeeCny = 0
        discountCny = 0
      }
    }

    const totalCny = Math.max(subtotalCny + shippingFeeCny + taxCny - discountCny, 0)
    const quote = this.fx.getQuote()

    return {
      subtotalCny,
      shippingFeeCny,
      discountCny,
      taxCny,
      totalCny,
      // 表示専用。決済額は人民元建ての totalCny。
      totalJpyEstimate: this.fx.toJpy(totalCny, quote.rate),
      fxRate: quote.rate,
      fxQuotedAt: quote.quotedAt,
    }
  }

  /**
   * FEFO（First Expired, First Out）で在庫を引き当てる。
   *
   * 期限が近いロットから確保することで廃棄ロスを減らす。健康食品では
   * 賞味期限が短い商品も多く、在庫回転の設計がそのまま利益に効く。
   */
  private async allocateFefo(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<{ productId: string; batchNo: string; quantity: number }[]> {
    const batches = await tx.stockBatch.findMany({
      where: { productId, expiryDate: { gt: new Date() } },
      orderBy: { expiryDate: 'asc' },
    })

    const allocations: { productId: string; batchNo: string; quantity: number }[] = []
    let remaining = quantity

    for (const batch of batches) {
      if (remaining <= 0) break

      const available = batch.quantity - batch.reserved
      if (available <= 0) continue

      const take = Math.min(available, remaining)

      // 条件付き更新で楽観ロック。他のトランザクションが先に確保していたら 0 件になる。
      const { count } = await tx.stockBatch.updateMany({
        where: {
          id: batch.id,
          // 「更新時点でも確保可能である」ことを条件に入れる
          reserved: { lte: batch.quantity - take },
        },
        data: { reserved: { increment: take } },
      })

      if (count === 0) {
        this.logger.warn(`stock allocation raced on batch ${batch.id}; retrying next batch`)
        continue
      }

      allocations.push({ productId, batchNo: batch.batchNo, quantity: take })
      remaining -= take
    }

    if (remaining > 0) {
      // トランザクションはロールバックされるので、確保済み分も自動的に戻る
      throw new ConflictException('Insufficient stock')
    }

    return allocations
  }

  private toResponse(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
    amounts: Awaited<ReturnType<OrdersService['calculate']>>,
    address: unknown,
  ) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      items: order.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        name: item.nameSnapshot,
        thumbnail: item.thumbnail,
        priceCny: item.priceCny,
        quantity: item.quantity,
      })),
      amounts,
      address,
      shippingMethod: order.shippingMethod,
      remark: order.remark ?? undefined,
      createdAt: order.createdAt.toISOString(),
    }
  }

  private serialize(order: Prisma.OrderGetPayload<{ include: { items: true } }>) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      items: order.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        name: item.nameSnapshot,
        thumbnail: item.thumbnail,
        priceCny: item.priceCny,
        quantity: item.quantity,
      })),
      amounts: {
        subtotalCny: order.subtotalCny,
        shippingFeeCny: order.shippingFeeCny,
        discountCny: order.discountCny,
        taxCny: order.taxCny,
        totalCny: order.totalCny,
        totalJpyEstimate: order.totalJpyEstimate,
        fxRate: order.fxRate,
        fxQuotedAt: order.fxQuotedAt.toISOString(),
      },
      address: order.addressSnapshot,
      shippingMethod: order.shippingMethod,
      trackingNo: order.trackingNo ?? undefined,
      remark: order.remark ?? undefined,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString(),
    }
  }
}

/**
 * 注文番号。微信支付の out_trade_no に使うため 32 文字以内・英数字のみ。
 * 例: HF20260806143012A7K3
 */
function generateOrderNo(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  // 同一秒の衝突を避けるため、暗号論的乱数で 4 文字足す
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += alphabet[randomInt(alphabet.length)]

  return `HF${stamp}${suffix}`
}
