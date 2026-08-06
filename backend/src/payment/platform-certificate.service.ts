import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

interface CertificateResponse {
  data: {
    serial_no: string
    effective_time: string
    expire_time: string
    encrypt_certificate: {
      algorithm: string
      nonce: string
      associated_data: string
      ciphertext: string
    }
  }[]
}

interface CachedCertificate {
  serialNo: string
  /** PEM 形式の公開証明書 */
  pem: string
  expiresAt: Date
}

const WECHAT_PAY_HOST = 'https://api.mch.weixin.qq.com'

/**
 * 微信支付プラットフォーム証明書の取得・キャッシュ・ローテーション追随。
 *
 * ■ なぜ必要か
 *   支付通知は「入金があった」とサーバに教える唯一の正本。ここに認証が
 *   無いと、誰でも通知エンドポイントを叩いて注文を支払い済みにできる。
 *   署名検証は、その通知が本当に微信支付から来たことを保証する唯一の手段。
 *
 * ■ ローテーション
 *   プラットフォーム証明書は定期的に更新され、切り替え期間中は
 *   新旧 2 枚が並行して有効になる。serial_no で使い分ける必要があるため、
 *   単一の証明書をファイルで固定してはいけない。
 *   未知の serial_no を受け取ったら再取得する。
 *
 * ■ 鶏と卵の問題
 *   /v3/certificates 自身のレスポンスにも署名が付くが、その検証には
 *   証明書が要る。微信の公式ガイドどおり、この API のレスポンスだけは
 *   署名検証をせず、代わりに APIv3 鍵で復号できることをもって真正性を担保する
 *   （鍵を知らない第三者は正しい暗号文を作れない）。
 */
@Injectable()
export class PlatformCertificateService {
  private readonly logger = new Logger(PlatformCertificateService.name)

  private readonly mchId: string
  private readonly serialNo: string
  private readonly apiV3Key: string
  private readonly privateKey: string

  private cache = new Map<string, CachedCertificate>()
  private lastFetchedAt = 0
  /** 取得の同時実行を防ぐ（通知が並行して届くため） */
  private inflight: Promise<void> | null = null

  /** 最短再取得間隔。未知の serial が来るたびに叩かれるのを防ぐ。 */
  private static readonly MIN_REFETCH_INTERVAL_MS = 60_000
  /** 定期リフレッシュ間隔（12 時間） */
  private static readonly REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000

  constructor(private readonly config: ConfigService) {
    this.mchId = this.config.getOrThrow<string>('WECHAT_MCH_ID')
    this.serialNo = this.config.getOrThrow<string>('WECHAT_MCH_CERT_SERIAL')
    this.apiV3Key = this.config.getOrThrow<string>('WECHAT_API_V3_KEY')

    const keyPath = this.config.getOrThrow<string>('WECHAT_MCH_PRIVATE_KEY_PATH')
    this.privateKey = fs.readFileSync(keyPath, 'utf8')
  }

  /**
   * serial_no に対応する証明書を返す。
   * 未知の serial なら再取得を試みる（ローテーション直後を想定）。
   */
  async getCertificate(serialNo: string): Promise<string | null> {
    const cached = this.cache.get(serialNo)
    if (cached && cached.expiresAt > new Date()) return cached.pem

    const stale = Date.now() - this.lastFetchedAt > PlatformCertificateService.MIN_REFETCH_INTERVAL_MS
    if (!cached && !stale) {
      // 直近で取得済みなのに見つからない = 本当に未知の serial。
      // 短時間に何度も外部 API を叩かない。
      this.logger.warn(`unknown platform certificate serial ${serialNo} (refetch throttled)`)
      return null
    }

    await this.refresh()

    const refreshed = this.cache.get(serialNo)
    if (!refreshed) {
      this.logger.error(`platform certificate ${serialNo} not found after refresh`)
      return null
    }
    return refreshed.pem
  }

  /** 証明書一覧を取得して差し替える。並行呼び出しは 1 回にまとめる。 */
  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight

    this.inflight = this.doRefresh().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async doRefresh(): Promise<void> {
    try {
      const response = await this.requestCertificates()
      const next = new Map<string, CachedCertificate>()

      for (const item of response.data) {
        const { nonce, associated_data: aad, ciphertext } = item.encrypt_certificate
        const pem = this.decryptCertificate(ciphertext, nonce, aad)
        next.set(item.serial_no, {
          serialNo: item.serial_no,
          pem,
          expiresAt: new Date(item.expire_time),
        })
      }

      if (next.size === 0) {
        this.logger.error('certificate endpoint returned no certificates; keeping previous cache')
        return
      }

      this.cache = next
      this.lastFetchedAt = Date.now()
      this.logger.log(`loaded ${next.size} platform certificate(s): ${[...next.keys()].join(', ')}`)
    } catch (err) {
      // 取得に失敗しても既存キャッシュは残す。通知検証を止めないため。
      this.logger.error(`failed to refresh platform certificates: ${String(err)}`)
    }
  }

  /** 起動後と 12 時間ごとにリフレッシュしておく（通知到着時の遅延を避ける） */
  startBackgroundRefresh(): void {
    void this.refresh()
    const timer = setInterval(
      () => void this.refresh(),
      PlatformCertificateService.REFRESH_INTERVAL_MS,
    )
    // Node のイベントループをこのタイマーで生かし続けない
    timer.unref?.()
  }

  /**
   * 支付通知の署名検証。
   *
   * 署名対象は「timestamp\nnonce\nbody\n」。body は必ず
   * パース前の生文字列を使う（再シリアライズすると別物になる）。
   */
  async verify(
    serialNo: string,
    timestamp: string,
    nonce: string,
    rawBody: string,
    signature: string,
  ): Promise<boolean> {
    // リプレイ攻撃対策: 5 分以上ずれた通知は受け付けない
    const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
    if (!Number.isFinite(skewSeconds) || skewSeconds > 300) {
      this.logger.warn(`notify timestamp skew too large: ${skewSeconds}s`)
      return false
    }

    const pem = await this.getCertificate(serialNo)
    if (!pem) return false

    const message = `${timestamp}\n${nonce}\n${rawBody}\n`
    try {
      return crypto.createVerify('RSA-SHA256').update(message).verify(pem, signature, 'base64')
    } catch (err) {
      this.logger.error(`signature verification threw: ${String(err)}`)
      return false
    }
  }

  // ----------------------------------------------------------

  /** GET /v3/certificates。このレスポンスだけは署名検証をしない（上のコメント参照）。 */
  private async requestCertificates(): Promise<CertificateResponse> {
    const path = '/v3/certificates'
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')

    const message = `GET\n${path}\n${timestamp}\n${nonceStr}\n\n`
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(message)
      .sign(this.privateKey, 'base64')

    const authorization =
      `WECHATPAY2-SHA256-RSA2048 ` +
      `mchid="${this.mchId}",` +
      `nonce_str="${nonceStr}",` +
      `signature="${signature}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${this.serialNo}"`

    const response = await fetch(`${WECHAT_PAY_HOST}${path}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'User-Agent': 'health-food-shop/0.1.0',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`certificates endpoint returned ${response.status}: ${await response.text()}`)
    }
    return (await response.json()) as CertificateResponse
  }

  /** 証明書本体は APIv3 鍵で AES-256-GCM 暗号化されている */
  private decryptCertificate(ciphertext: string, nonce: string, aad: string): string {
    const buffer = Buffer.from(ciphertext, 'base64')
    const authTag = buffer.subarray(buffer.length - 16)
    const data = buffer.subarray(0, buffer.length - 16)

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.apiV3Key, nonce)
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(aad))

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }
}
