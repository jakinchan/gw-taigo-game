import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'

import { PrismaService } from '../common/prisma/prisma.service'

export interface FxQuote {
  rate: number
  quotedAt: string
  source: string
}

/**
 * CNY → JPY の参考レート。
 *
 * ■ このレートは何に使うのか
 *   小程序で「¥128.00（約 ￥2,688）」と併記するための表示専用の値。
 *   顧客が実際に支払うのは人民元建ての金額で、加盟店への入金額は
 *   微信支付／決済代行が精算時に確定させる。
 *   したがって、ここで取得したレートを請求額の計算に使ってはならない。
 *
 * ■ なぜ注文に保存するのか
 *   注文一覧を後から開いたときに「注文時に見えていた円換算」と
 *   食い違うと問い合わせになる。注文時のレートを Order に固定して残す。
 */
@Injectable()
export class FxService implements OnModuleInit {
  private readonly logger = new Logger(FxService.name)
  private cached: FxQuote

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.cached = {
      rate: Number(this.config.get<string>('FX_FALLBACK_RATE', '21.0')),
      quotedAt: new Date(0).toISOString(),
      source: 'fallback',
    }
  }

  async onModuleInit(): Promise<void> {
    // 起動時に一度だけ、DB に残っている直近のレートを復元する
    const latest = await this.prisma.fxRate.findFirst({
      where: { base: 'CNY', quote: 'JPY' },
      orderBy: { quotedAt: 'desc' },
    })
    if (latest) {
      this.cached = {
        rate: latest.rate,
        quotedAt: latest.quotedAt.toISOString(),
        source: latest.source,
      }
    }
    await this.refresh()
  }

  getQuote(): FxQuote {
    return this.cached
  }

  /** CNY（分）→ JPY（円）。円は最小単位が 1 円なので四捨五入する。 */
  toJpy(cnyFen: number, rate: number = this.cached.rate): number {
    return Math.round((cnyFen / 100) * rate)
  }

  /** 既定 6 時間ごとに更新。レートが取れなくても前回値で動き続ける。 */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refresh(): Promise<void> {
    const url = this.config.get<string>('FX_RATE_API_URL')
    if (!url) return

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const body = (await response.json()) as { rates?: Record<string, number> }
      const rate = body.rates?.JPY

      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        this.logger.warn(`unexpected fx payload: ${JSON.stringify(body).slice(0, 200)}`)
        return
      }

      // 前回比 ±20% を超える変動は API 側の異常を疑い、採用しない。
      // 誤ったレートで「約 ￥26,880」などと表示すると信用問題になる。
      if (this.cached.source !== 'fallback') {
        const change = Math.abs(rate - this.cached.rate) / this.cached.rate
        if (change > 0.2) {
          this.logger.error(`fx rate jumped ${(change * 100).toFixed(1)}% (${this.cached.rate} → ${rate}); rejected`)
          return
        }
      }

      const quotedAt = new Date()
      this.cached = { rate, quotedAt: quotedAt.toISOString(), source: url }

      await this.prisma.fxRate.create({
        data: { base: 'CNY', quote: 'JPY', rate, source: url, quotedAt },
      })

      this.logger.log(`fx rate updated: 1 CNY = ${rate} JPY`)
    } catch (err) {
      this.logger.warn(`fx refresh failed, keeping previous rate: ${String(err)}`)
    }
  }
}
