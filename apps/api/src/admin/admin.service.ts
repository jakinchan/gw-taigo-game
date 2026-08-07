import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { OrderStatus } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'
import { TaxRateService } from '../customs/tax-rate.service'
import type { CreateBatchDto, ShipOrderDto, UpdateProductDto } from './dto/admin.dto'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxRates: TaxRateService,
  ) {}

  // ------------------------------------------------------------
  // 概況
  // ------------------------------------------------------------

  /** ダッシュボードの数値。集計は DB 側で済ませ、全件を持ってこない。 */
  async getOverview() {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [productCount, activeCount, orderCounts, paidToday, lowStock] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { paidAt: { gte: todayStart } },
        _sum: { totalCny: true },
        _count: { _all: true },
      }),
      this.countLowStockProducts(),
    ])

    // groupBy の結果を扱いやすい形に均す
    const byStatus: Record<string, number> = {}
    for (const row of orderCounts) byStatus[row.status] = row._count._all

    return {
      products: { total: productCount, active: activeCount, lowStock },
      orders: {
        pendingPayment: byStatus[OrderStatus.pending_payment] ?? 0,
        pendingShipment: byStatus[OrderStatus.pending_shipment] ?? 0,
        shipped: byStatus[OrderStatus.shipped] ?? 0,
        completed: byStatus[OrderStatus.completed] ?? 0,
      },
      today: {
        paidOrders: paidToday._count._all,
        paidAmountCny: paidToday._sum.totalCny ?? 0,
      },
    }
  }

  /**
   * 在庫僅少の商品数。
   * 期限切れロットは出荷できないので数に入れない。
   */
  private async countLowStockProducts(threshold = 20): Promise<number> {
    const batches = await this.prisma.stockBatch.findMany({
      where: { expiryDate: { gt: new Date() } },
      select: { productId: true, quantity: true, reserved: true },
    })

    const available = new Map<string, number>()
    for (const b of batches) {
      available.set(b.productId, (available.get(b.productId) ?? 0) + Math.max(b.quantity - b.reserved, 0))
    }

    const activeIds = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    return activeIds.filter((p) => (available.get(p.id) ?? 0) <= threshold).length
  }

  // ------------------------------------------------------------
  // 商品
  // ------------------------------------------------------------

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } })
    if (!product) throw new NotFoundException('商品が見つかりません')

    /**
     * 参考価格が販売価格を下回ると「値上げしたのに割引に見える」表示になる。
     * 表示の整合はここで止める。
     */
    const nextPrice = dto.priceCny ?? product.priceCny
    const nextOriginal = dto.originalPriceCny ?? product.originalPriceCny
    if (nextOriginal !== null && nextOriginal !== undefined && nextOriginal < nextPrice) {
      throw new BadRequestException({
        code: 'INVALID_PRICE',
        message: '参考価格は販売価格以上にしてください',
      })
    }

    // HS コードを変えるなら、税率テーブルに存在するかを先に確かめる
    if (dto.hsCode) {
      const rule = this.taxRates.resolve(dto.hsCode)
      if (!rule.hsCode) {
        throw new BadRequestException({
          code: 'UNKNOWN_HS_CODE',
          message: `HS コード ${dto.hsCode} の税率が登録されていません`,
        })
      }
    }

    const updated = await this.prisma.product.update({ where: { id }, data: dto })
    this.logger.log(`商品 ${product.sku} を更新: ${JSON.stringify(dto)}`)
    return updated
  }

  // ------------------------------------------------------------
  // 在庫ロット
  // ------------------------------------------------------------

  async listBatches(productId: string) {
    const batches = await this.prisma.stockBatch.findMany({
      where: { productId },
      orderBy: { expiryDate: 'asc' },
    })

    return batches.map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate.toISOString().slice(0, 10),
      quantity: b.quantity,
      reserved: b.reserved,
      /** 実際に引き当て可能な数。注文で確保済みの分を除く。 */
      available: Math.max(b.quantity - b.reserved, 0),
      expired: b.expiryDate <= new Date(),
      warehouse: b.warehouse,
    }))
  }

  async addBatch(productId: string, dto: CreateBatchDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new NotFoundException('商品が見つかりません')

    const expiryDate = new Date(dto.expiryDate)
    if (expiryDate <= new Date()) {
      throw new BadRequestException({
        code: 'EXPIRED_BATCH',
        message: '賞味期限が過去のロットは登録できません',
      })
    }

    const exists = await this.prisma.stockBatch.findUnique({
      where: { productId_batchNo: { productId, batchNo: dto.batchNo } },
    })
    if (exists) {
      throw new ConflictException({
        code: 'DUPLICATE_BATCH',
        message: `ロット ${dto.batchNo} は既に登録されています`,
      })
    }

    const created = await this.prisma.stockBatch.create({
      data: {
        productId,
        batchNo: dto.batchNo,
        expiryDate,
        quantity: dto.quantity,
        warehouse: dto.warehouse ?? null,
      },
    })
    this.logger.log(`ロット追加: ${product.sku} / ${dto.batchNo} × ${dto.quantity}`)
    return created
  }

  /**
   * ロットの廃棄。
   * 確保済み（reserved）がある間は消せない。消すと、その注文が
   * どのロットを出荷するはずだったのか追えなくなる。
   */
  async removeBatch(batchId: string) {
    const batch = await this.prisma.stockBatch.findUnique({ where: { id: batchId } })
    if (!batch) throw new NotFoundException('ロットが見つかりません')

    if (batch.reserved > 0) {
      throw new ConflictException({
        code: 'BATCH_RESERVED',
        message: `未出荷の注文が ${batch.reserved} 点確保しています。出荷またはキャンセル後に削除してください`,
      })
    }

    await this.prisma.stockBatch.delete({ where: { id: batchId } })
    this.logger.log(`ロット削除: ${batch.batchNo}`)
  }

  // ------------------------------------------------------------
  // 注文
  // ------------------------------------------------------------

  /**
   * 出荷登録。
   * 入金済み（pending_shipment）のものだけを対象にする。
   * 未払いの注文を出荷できてしまうと、代金を受け取らずに商品が出ていく。
   */
  async shipOrder(orderId: string, dto: ShipOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('注文が見つかりません')

    if (order.status !== OrderStatus.pending_shipment) {
      throw new ConflictException({
        code: 'NOT_SHIPPABLE',
        message: '発送待ちの注文のみ出荷登録できます',
      })
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId, status: OrderStatus.pending_shipment },
      data: {
        status: OrderStatus.shipped,
        trackingNo: dto.trackingNo,
        shippedAt: new Date(),
      },
    })
    this.logger.log(`出荷登録: ${order.orderNo} / 追跡番号 ${dto.trackingNo}`)
    return updated
  }

  // ------------------------------------------------------------
  // 税率
  // ------------------------------------------------------------

  async listTaxRates() {
    const rows = await this.prisma.hsCodeTaxRate.findMany({ orderBy: { hsCode: 'asc' } })
    return rows.map((row) => ({
      ...row,
      // 画面で毎回計算させないよう、実効税率もサーバで出す
      effectiveRate: this.taxRates.resolve(row.hsCode).effectiveRate,
    }))
  }
}
