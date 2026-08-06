import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'
import { WechatPayService, type DecryptedNotify } from './wechat-pay.service'

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatPay: WechatPayService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 決済パラメータの発行。
   * 金額は必ず DB の注文から取る。クライアントが送ってきた額は使わない。
   */
  async createPayment(userId: string, orderNo: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo, userId },
      include: { user: { select: { openId: true } }, items: true },
    })

    if (!order) throw new NotFoundException('Order not found')
    if (order.status !== OrderStatus.pending_payment) {
      throw new ConflictException('Order is not payable')
    }
    if (order.totalCny <= 0) throw new BadRequestException('Invalid order amount')

    const description = order.items
      .map((item) => extractName(item.nameSnapshot))
      .join('、')
      .slice(0, 100)

    const { prepayId, payParams } = await this.wechatPay.createJsapiOrder({
      outTradeNo: order.orderNo,
      description: description || 'Health Food',
      amountCny: order.totalCny,
      openId: order.user.openId,
    })

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: this.config.get<string>('PAYMENT_PROVIDER', 'wechat_direct'),
        prepayId,
        status: PaymentStatus.pending,
        amountCny: order.totalCny,
      },
    })

    return payParams
  }

  /**
   * 支付通知の処理。
   *
   * 冪等性が要。微信は通知が届かない／応答が遅いと最大 15 回まで再送するので、
   * 同じ通知を何度受け取っても結果が変わらないようにする。
   */
  async handleNotify(notify: DecryptedNotify): Promise<void> {
    if (notify.trade_state !== 'SUCCESS') {
      this.logger.warn(`notify with non-success state: ${notify.trade_state}`)
      return
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNo: notify.out_trade_no },
    })
    if (!order) {
      this.logger.error(`notify for unknown order: ${notify.out_trade_no}`)
      return
    }

    // 既に処理済みなら何もしない（再送された通知）
    if (order.status !== OrderStatus.pending_payment) {
      this.logger.log(`duplicate notify ignored for ${order.orderNo}`)
      return
    }

    /**
     * 金額の突合。ここが最後の砦。
     * 通知された金額と注文額が違う場合は、決済を成立させずに調査へ回す。
     */
    if (notify.amount.total !== order.totalCny) {
      this.logger.error(
        `amount mismatch on ${order.orderNo}: notify=${notify.amount.total} order=${order.totalCny}`,
      )
      return
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id, status: OrderStatus.pending_payment },
        data: { status: OrderStatus.pending_shipment, paidAt: new Date() },
      })

      await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.success,
          transactionId: notify.transaction_id,
          rawNotify: notify as unknown as Prisma.InputJsonValue,
        },
      })

      // 確保していた在庫を「出荷確定」として実在庫から差し引く
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } })
      for (const item of items) {
        if (!item.batchNo) continue
        await tx.stockBatch.updateMany({
          where: { productId: item.productId, batchNo: item.batchNo },
          data: {
            quantity: { decrement: item.quantity },
            reserved: { decrement: item.quantity },
          },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { salesCount: { increment: item.quantity } },
        })
      }
    })

    this.logger.log(`order ${order.orderNo} paid (txn ${notify.transaction_id})`)
  }

  /** 小程序が決済後にポーリングする。支付通知が届く前でも微信へ照会して確定させる。 */
  async getStatus(userId: string, orderNo: string): Promise<{ paid: boolean }> {
    const order = await this.prisma.order.findFirst({
      where: { orderNo, userId },
      select: { id: true, orderNo: true, status: true },
    })
    if (!order) throw new NotFoundException('Order not found')

    if (order.status !== OrderStatus.pending_payment) return { paid: true }

    // 通知が遅れている可能性があるので、微信に直接聞く
    try {
      const result = await this.wechatPay.queryOrder(order.orderNo)
      if (result.trade_state === 'SUCCESS' && result.transaction_id) {
        await this.prisma.order.updateMany({
          where: { id: order.id, status: OrderStatus.pending_payment },
          data: { status: OrderStatus.pending_shipment, paidAt: new Date() },
        })
        return { paid: true }
      }
    } catch (err) {
      this.logger.warn(`queryOrder failed for ${order.orderNo}: ${String(err)}`)
    }

    return { paid: false }
  }

  /**
   * 精算見込みの照会。
   * 実際の入金額は微信支付／決済代行の精算で確定するため、
   * ここで返すのは注文時レートに基づく参考値であることを明示する。
   */
  async getQuote(userId: string, orderNo: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo, userId },
      select: { totalCny: true, fxRate: true, fxQuotedAt: true, totalJpyEstimate: true },
    })
    if (!order) throw new NotFoundException('Order not found')

    return {
      chargeCny: order.totalCny,
      estimatedSettlementJpy: order.totalJpyEstimate,
      fxRate: order.fxRate,
      quotedAt: order.fxQuotedAt.toISOString(),
      provider: this.config.get<string>('PAYMENT_PROVIDER', 'wechat_direct'),
    }
  }
}

/** nameSnapshot（多言語 JSON）から中国語名を取り出す。決済明細は中国語で出す。 */
function extractName(snapshot: unknown): string {
  if (typeof snapshot === 'object' && snapshot !== null && 'zh-CN' in snapshot) {
    return String((snapshot as Record<string, unknown>)['zh-CN'])
  }
  return ''
}
