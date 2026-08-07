import { Injectable, Logger } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'

/** 1 回あたりの限度額（分）。5,000 元。 */
export const SINGLE_LIMIT_CNY = 500_000

/** 年間の限度額（分）。26,000 元。 */
export const ANNUAL_LIMIT_CNY = 2_600_000

export interface LimitCheck {
  allowed: boolean
  /** 今年すでに使った額（分） */
  usedCny: number
  /** 今年の残枠（分） */
  remainingCny: number
  /** 判定対象になった今回の商品価額（分） */
  dutiableCny: number
  reason?: 'single_exceeded' | 'annual_exceeded' | 'not_verified'
  /** 集計対象年 */
  year: number
}

/**
 * 越境EC 小売輸入の個人年度購入限度額チェック。
 *
 * ■ 根拠
 *   《关于完善跨境电子商务零售进口税收政策的通知》により、
 *   単回 5,000 元・年間 26,000 元 の限度内は関税 0%、増値税・消費税 70% 課税。
 *   限度を超えた分は一般貿易として全額課税されるため、越境EC の枠では
 *   販売できない（超過分は注文自体を成立させない運用が一般的）。
 *
 * ■ 集計単位は「個人」であってアカウントではない
 *   同一人物が複数の微信アカウントで購入しても、海关側では身分証番号で
 *   名寄せされる。アカウント単位で数えると限度超過を見逃し、通関で
 *   差し戻される（＝顧客に届かないのに決済済み、という最悪の状態になる）。
 *   そのため idCardHash で横断集計する。
 *
 * ■ 何を限度額に算入するか
 *   「商品実付金額」（値引き後の商品価額）を用いる。送料・税額は含めない。
 *   プラットフォームによって解釈に幅があるため、通関業者と要すり合わせ。
 */
@Injectable()
export class PurchaseLimitService {
  private readonly logger = new Logger(PurchaseLimitService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 今回の注文を追加して限度内に収まるかを判定する。
   *
   * @param idCardHash 申告名義人の身分証ハッシュ。null は未実名認証。
   * @param dutiableCny 今回の商品価額（分・値引き後、送料と税は除く）
   */
  async check(idCardHash: string | null, dutiableCny: number): Promise<LimitCheck> {
    const year = new Date().getFullYear()

    if (!idCardHash) {
      return {
        allowed: false,
        usedCny: 0,
        remainingCny: ANNUAL_LIMIT_CNY,
        dutiableCny,
        reason: 'not_verified',
        year,
      }
    }

    // 単回限度は年間の消費状況に関係なく効く
    if (dutiableCny > SINGLE_LIMIT_CNY) {
      const used = await this.usedThisYear(idCardHash, year)
      return {
        allowed: false,
        usedCny: used,
        remainingCny: Math.max(ANNUAL_LIMIT_CNY - used, 0),
        dutiableCny,
        reason: 'single_exceeded',
        year,
      }
    }

    const usedCny = await this.usedThisYear(idCardHash, year)
    const remainingCny = Math.max(ANNUAL_LIMIT_CNY - usedCny, 0)

    if (dutiableCny > remainingCny) {
      return {
        allowed: false,
        usedCny,
        remainingCny,
        dutiableCny,
        reason: 'annual_exceeded',
        year,
      }
    }

    return { allowed: true, usedCny, remainingCny, dutiableCny, year }
  }

  /**
   * 当年の使用済み額（分）。
   *
   * 未払い・キャンセル済みは数えない。支払い済み（＝通関に流れる）注文のみが
   * 限度額を消費する。返金済みの扱いは税関の運用に依存するため、
   * refunding は保守的に「消費したまま」として扱う。
   */
  async usedThisYear(idCardHash: string, year = new Date().getFullYear()): Promise<number> {
    const from = new Date(Date.UTC(year, 0, 1))
    const to = new Date(Date.UTC(year + 1, 0, 1))

    const result = await this.prisma.order.aggregate({
      where: {
        declarantIdHash: idCardHash,
        paidAt: { gte: from, lt: to },
        status: {
          in: [
            OrderStatus.pending_shipment,
            OrderStatus.shipped,
            OrderStatus.completed,
            OrderStatus.refunding,
          ],
        },
      },
      _sum: { subtotalCny: true, discountCny: true },
    })

    const subtotal = result._sum.subtotalCny ?? 0
    const discount = result._sum.discountCny ?? 0
    return Math.max(subtotal - discount, 0)
  }

  /** マイページ表示用。今年の枠の使用状況を返す。 */
  async getQuota(idCardHash: string | null) {
    const year = new Date().getFullYear()
    if (!idCardHash) {
      return {
        year,
        verified: false,
        usedCny: 0,
        limitCny: ANNUAL_LIMIT_CNY,
        remainingCny: ANNUAL_LIMIT_CNY,
        singleLimitCny: SINGLE_LIMIT_CNY,
      }
    }

    const usedCny = await this.usedThisYear(idCardHash, year)
    return {
      year,
      verified: true,
      usedCny,
      limitCny: ANNUAL_LIMIT_CNY,
      remainingCny: Math.max(ANNUAL_LIMIT_CNY - usedCny, 0),
      singleLimitCny: SINGLE_LIMIT_CNY,
    }
  }
}
