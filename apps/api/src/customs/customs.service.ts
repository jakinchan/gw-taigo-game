import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { DeclarationStatus, OrderStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'

import { PrismaService } from '../common/prisma/prisma.service'
import { CryptoService } from '../common/crypto/crypto.service'

/**
 * 海关総署への注文申告（「三单对碰」の订单单 / CEB311Message）。
 *
 * ■ 三单对碰とは
 *   越境EC の通関では、以下 3 つの伝票が海关側で突合される。
 *     1. 订单单（注文）  … 本サービスが送信する
 *     2. 支付单（決済）  … 微信支付など決済機関が送信する
 *     3. 运单（物流）    … 物流会社が送信する
 *   3 つの「订单编号」が一致して初めて通関が進む。したがって注文番号は
 *   決済（out_trade_no）・物流の三者で同じものを使う必要がある。
 *   本実装では Order.orderNo を共通キーにしている。
 *
 * ■ 申告のタイミング
 *   入金確定後。未払いの注文を申告しても支付单と突合できない。
 *   PaymentService が入金を確定させた後にこのサービスが拾う。
 *
 * ■ 本番で追加が必要なもの
 *   実際の送信には 电子口岸 の企業カード（USB キー）または
 *   サーバ証明書による XML 署名が必要で、証明書は法人ごとに発行される。
 *   ここでは署名と送信を CustomsGateway として分離してあるので、
 *   通関業者（報関行）の SaaS を使う場合はそのクライアントに差し替える。
 */
@Injectable()
export class CustomsService {
  private readonly logger = new Logger(CustomsService.name)
  private readonly enabled: boolean
  private readonly ebpCode: string
  private readonly ebcCode: string
  private readonly endpoint: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<string>('CUSTOMS_ENABLED') === 'true'
    this.ebpCode = this.config.get<string>('CUSTOMS_EBP_CODE', '')
    this.ebcCode = this.config.get<string>('CUSTOMS_EBC_CODE', '')
    this.endpoint = this.config.get<string>('CUSTOMS_API_ENDPOINT', '')
  }

  /**
   * 申告レコードを作成する（送信はまだしない）。
   * 入金確定のトランザクション内から呼ばれるため、外部通信をここでしない。
   * 通信を挟むとトランザクションが長引き、DB のロックを持ち続けてしまう。
   */
  async enqueue(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    if (!this.enabled) return

    await tx.customsDeclaration.upsert({
      where: { orderId },
      update: {}, // 既にあれば何もしない（再入金通知に対する冪等性）
      create: {
        orderId,
        // guid は再送時も同じ値を使う。海关側はこれで重複を弾く。
        guid: randomUUID(),
        ebpCode: this.ebpCode,
        ebcCode: this.ebcCode,
        status: DeclarationStatus.pending,
      },
    })
  }

  /**
   * 申告ペイロードの組み立て。
   * 身分証番号と実名はここで初めて復号する。
   */
  async buildPayload(orderId: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        user: true,
        declaration: true,
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    if (!order.user.idCardEncrypted || !order.user.realNameEncrypted) {
      throw new Error(`order ${order.orderNo} has no verified declarant`)
    }

    const idCard = this.crypto.decrypt(order.user.idCardEncrypted)
    const realName = this.crypto.decrypt(order.user.realNameEncrypted)
    const address = order.addressSnapshot as Record<string, string>

    return {
      guid: order.declaration?.guid ?? randomUUID(),
      appType: '1', // 1 = 新規申告
      appTime: formatCustomsTime(new Date()),
      orderType: 'I', // I = 進口（輸入）
      orderNo: order.orderNo,
      ebpCode: this.ebpCode,
      ebcCode: this.ebcCode,

      // 金額はすべて元単位の小数 2 桁で申告する（DB は分なので 100 で割る）
      goodsValue: toYuan(order.subtotalCny - order.discountCny),
      freight: toYuan(order.shippingFeeCny),
      discount: toYuan(order.discountCny),
      taxTotal: toYuan(order.taxCny),
      acturalPaid: toYuan(order.totalCny), // 海关の項目名は "acturalPaid"（原文ママ）
      currency: '142', // 142 = 人民元（海关の通貨コード）

      // 申告名義人＝支払者。三者一致が必要なので受取人とは別項目で送る。
      buyerRegNo: order.userId,
      buyerName: realName,
      buyerIdType: '1', // 1 = 身分証
      buyerIdNumber: idCard,

      consignee: address.receiverName,
      consigneeTelephone: address.phone,
      consigneeAddress: `${address.province}${address.city}${address.district}${address.detail}`,

      goods: order.items.map((item, index) => ({
        gnum: index + 1,
        itemNo: item.sku,
        itemName: extractZh(item.nameSnapshot),
        gcode: item.hsCode ?? item.product.hsCode ?? '',
        gname: extractZh(item.nameSnapshot),
        country: item.product.originCountry,
        currency: '142',
        qty: item.quantity,
        unit: item.product.customsUnit,
        price: toYuan(item.priceCny),
        totalPrice: toYuan(item.priceCny * item.quantity),
        note: item.batchNo ?? '',
      })),

      // 正味重量・総重量（kg 単位、小数 3 桁）
      netWeight: toKg(order.items.reduce((s, i) => s + i.product.netWeightG * i.quantity, 0)),
      grossWeight: toKg(order.items.reduce((s, i) => s + i.product.grossWeightG * i.quantity, 0)),
    }
  }

  /**
   * 1 件送信する。成功/失敗をレコードに書き戻す。
   */
  async submit(orderId: string): Promise<DeclarationStatus> {
    const declaration = await this.prisma.customsDeclaration.findUnique({ where: { orderId } })
    if (!declaration) throw new NotFoundException('Declaration not found')

    let payload: Record<string, unknown>
    try {
      payload = await this.buildPayload(orderId)
    } catch (err) {
      await this.markFailed(orderId, `payload build failed: ${String(err)}`)
      return DeclarationStatus.failed
    }

    try {
      const response = await this.send(payload)

      const accepted = response.code === '10000' || response.code === 'SUCCESS'
      await this.prisma.customsDeclaration.update({
        where: { orderId },
        data: {
          status: accepted ? DeclarationStatus.submitted : DeclarationStatus.rejected,
          customsSerial: response.serial ?? null,
          // 身分証番号を含むので、保存前にマスクする
          requestPayload: maskSensitive(payload) as Prisma.InputJsonValue,
          responsePayload: response as unknown as Prisma.InputJsonValue,
          rejectReason: accepted ? null : (response.message ?? 'rejected'),
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      })

      this.logger.log(`declaration for order ${orderId}: ${accepted ? 'submitted' : 'rejected'}`)
      return accepted ? DeclarationStatus.submitted : DeclarationStatus.rejected
    } catch (err) {
      await this.markFailed(orderId, String(err))
      return DeclarationStatus.failed
    }
  }

  /**
   * 未送信・送信失敗分の再送。
   *
   * 海关のシステムは夜間メンテナンスで落ちることがあるため、
   * 一時的な失敗は必ず起きる前提でリトライを組む。
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPending(): Promise<void> {
    if (!this.enabled) return

    const targets = await this.prisma.customsDeclaration.findMany({
      where: {
        status: { in: [DeclarationStatus.pending, DeclarationStatus.failed] },
        attempts: { lt: 10 }, // 10 回で諦めて人間の確認に回す
        order: {
          status: {
            in: [OrderStatus.pending_shipment, OrderStatus.shipped, OrderStatus.completed],
          },
        },
      },
      take: 50,
      orderBy: { createdAt: 'asc' },
    })

    if (targets.length === 0) return
    this.logger.log(`retrying ${targets.length} customs declarations`)

    for (const target of targets) {
      await this.submit(target.orderId).catch((err) =>
        this.logger.error(`retry failed for ${target.orderId}: ${String(err)}`),
      )
    }
  }

  // ----------------------------------------------------------

  private async markFailed(orderId: string, reason: string): Promise<void> {
    this.logger.error(`declaration failed for order ${orderId}: ${reason}`)
    await this.prisma.customsDeclaration.update({
      where: { orderId },
      data: {
        status: DeclarationStatus.failed,
        rejectReason: reason.slice(0, 500),
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    })
  }

  /**
   * 実際の送信。
   *
   * TODO(本番): 电子口岸 の企業証明書による XML 署名が必要。
   * 报关行（通関業者）の SaaS を使う場合は、そのクライアントに差し替える。
   * ここでは JSON で POST する汎用ゲートウェイを想定している。
   */
  private async send(
    payload: Record<string, unknown>,
  ): Promise<{ code: string; message?: string; serial?: string }> {
    if (!this.endpoint) {
      throw new Error('CUSTOMS_API_ENDPOINT is not configured')
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': this.config.get<string>('CUSTOMS_APP_KEY', ''),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      throw new Error(`customs gateway returned ${response.status}`)
    }
    return (await response.json()) as { code: string; message?: string; serial?: string }
  }
}

// ------------------------------------------------------------

/** 分 → 元（小数 2 桁の文字列） */
function toYuan(fen: number): string {
  return (fen / 100).toFixed(2)
}

/** グラム → キログラム（小数 3 桁の文字列） */
function toKg(grams: number): string {
  return (grams / 1000).toFixed(3)
}

/** 海关の時刻書式 YYYYMMDDHHmmss */
function formatCustomsTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function extractZh(snapshot: unknown): string {
  if (typeof snapshot === 'object' && snapshot !== null && 'zh-CN' in snapshot) {
    return String((snapshot as Record<string, unknown>)['zh-CN'])
  }
  return ''
}

/** 監査ログに身分証番号の平文を残さない */
function maskSensitive(payload: Record<string, unknown>): Record<string, unknown> {
  const idNumber = payload.buyerIdNumber
  return {
    ...payload,
    buyerIdNumber:
      typeof idNumber === 'string' && idNumber.length === 18
        ? `${idNumber.slice(0, 6)}********${idNumber.slice(-4)}`
        : '****',
    buyerName: '****',
  }
}
