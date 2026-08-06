import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { PrismaService } from '../common/prisma/prisma.service'

export interface TaxRule {
  hsCode: string
  tariffRate: number
  vatRate: number
  exciseRate: number
  discount: number
  /** 実効税率（越境EC 綜合税） */
  effectiveRate: number
}

/**
 * HS コード別の税率解決。
 *
 * ■ 跨境电商综合税の計算
 *   限度額内の越境EC 小売輸入は、関税が暫定 0% で、
 *   増値税・消費税を法定納税額の 70% で課す。
 *
 *     综合税率 = (増値税率 + 消費税率) / (1 - 消費税率) × 70%
 *
 *   消費税は「価格に消費税を含めた額」に課されるため、
 *   1 - 消費税率で割り戻す（内税→外税の換算）。健康食品は
 *   通常 消費税率 0% なので、増値税率 13% なら 9.1% になる。
 *
 * ■ なぜテーブルで持つのか
 *   税率は改正される。商品に直接持たせると改正のたびに全商品を
 *   更新することになり、しかも過去の注文まで巻き添えになる。
 *   HS コード単位で持ち、注文明細には適用時点の税率を固定保存する。
 */
@Injectable()
export class TaxRateService implements OnModuleInit {
  private readonly logger = new Logger(TaxRateService.name)

  /** hsCode -> TaxRule。税率は頻繁に変わらないのでメモリに載せる。 */
  private cache = new Map<string, TaxRule>()

  /** HS コード未設定・未登録の商品に使う保守的な既定値（増値税 13% 相当） */
  private static readonly FALLBACK: Omit<TaxRule, 'hsCode'> = {
    tariffRate: 0,
    vatRate: 0.13,
    exciseRate: 0,
    discount: 0.7,
    effectiveRate: 0.091,
  }

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload()
  }

  /** 管理画面から税率を更新した後に呼ぶ */
  async reload(): Promise<void> {
    const now = new Date()
    const rows = await this.prisma.hsCodeTaxRate.findMany({
      where: {
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    })

    const next = new Map<string, TaxRule>()
    for (const row of rows) {
      // effectiveFrom の降順なので、最初に入ったものが最新。後続は無視する。
      if (next.has(row.hsCode)) continue
      next.set(row.hsCode, {
        hsCode: row.hsCode,
        tariffRate: row.tariffRate,
        vatRate: row.vatRate,
        exciseRate: row.exciseRate,
        discount: row.discount,
        effectiveRate: computeEffectiveRate(row.vatRate, row.exciseRate, row.discount),
      })
    }

    this.cache = next
    this.logger.log(`loaded ${next.size} HS code tax rules`)
  }

  /** HS コードから税率を引く。未登録なら保守的な既定値を返す。 */
  resolve(hsCode: string | null | undefined): TaxRule {
    if (!hsCode) return { hsCode: '', ...TaxRateService.FALLBACK }

    const rule = this.cache.get(hsCode)
    if (rule) return rule

    this.logger.warn(`no tax rule for HS code ${hsCode}; falling back to default rate`)
    return { hsCode, ...TaxRateService.FALLBACK }
  }

  /**
   * 明細の税額（分）。
   * 端数は切り上げず四捨五入する。海关申告額との差は 1 分単位で吸収される。
   */
  calculateTax(hsCode: string | null | undefined, lineTotalCny: number): {
    taxCny: number
    rate: number
  } {
    const rule = this.resolve(hsCode)
    return {
      taxCny: Math.round(lineTotalCny * rule.effectiveRate),
      rate: rule.effectiveRate,
    }
  }
}

/**
 * 综合税率 = (増値税率 + 消費税率) / (1 - 消費税率) × 優遇係数
 * @example computeEffectiveRate(0.13, 0, 0.7) === 0.091
 */
export function computeEffectiveRate(
  vatRate: number,
  exciseRate: number,
  discount: number,
): number {
  if (exciseRate >= 1) throw new Error('exciseRate must be < 1')
  const statutory = (vatRate + exciseRate) / (1 - exciseRate)
  // 浮動小数の誤差が税額に乗らないよう、率の段階で 6 桁に丸める
  return Math.round(statutory * discount * 1e6) / 1e6
}
