import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

export interface JsapiPrepayParams {
  outTradeNo: string
  description: string
  /** 請求額（分・CNY） */
  amountCny: number
  openId: string
  /** 注文の有効期限（ISO 8601） */
  timeExpire?: Date
}

export interface MiniProgramPayParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

/** 支付通知の復号後ペイロード（必要な項目のみ） */
export interface DecryptedNotify {
  out_trade_no: string
  transaction_id: string
  trade_state: string
  success_time?: string
  amount: { total: number; payer_total: number; currency: string; payer_currency: string }
}

const WECHAT_PAY_HOST = 'https://api.mch.weixin.qq.com'

/**
 * 微信支付 APIv3 クライアント（小程序支付）。
 *
 * ■ 越境決済（境外收单）について
 *   加盟店が海外法人の場合、微信支付は「跨境支付」として契約される。
 *   顧客は人民元で支払い、加盟店には契約通貨（ここでは JPY）で入金される。
 *   API に渡す金額は常に CNY の「分」であり、円換算は微信支付側が精算時に行う。
 *   つまりこのサービスが JPY を送ることはない。
 *
 *   SB ペイメントサービスなどの決済代行を経由する場合も、
 *   小程序から見た決済フロー（prepay_id → wx.requestPayment）は同じで、
 *   prepay_id を発行する相手が代行会社に変わるだけ。PaymentProvider
 *   インターフェースで差し替えられるようにしてある。
 *   参考: https://developer.sbpayment.jp/en/payment-service/overseas/wechat-pay/4973/
 *
 * ■ 秘密鍵の扱い
 *   商户 API 秘密鍵はこのプロセス内から出さない。ファイルパスは開発用で、
 *   本番では KMS / Secrets Manager から読み込むこと。
 */
@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name)

  private readonly appId: string
  private readonly mchId: string
  private readonly serialNo: string
  private readonly apiV3Key: string
  private readonly notifyUrl: string
  private readonly keyPath: string

  /** 秘密鍵は初回利用時に読み込む（下の privateKey を参照） */
  private cachedPrivateKey: string | null = null

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.get<string>('WECHAT_APP_ID', '')
    this.mchId = this.config.get<string>('WECHAT_MCH_ID', '')
    this.serialNo = this.config.get<string>('WECHAT_MCH_CERT_SERIAL', '')
    this.apiV3Key = this.config.get<string>('WECHAT_API_V3_KEY', '')
    this.notifyUrl = this.config.get<string>('WECHAT_PAY_NOTIFY_URL', '')
    this.keyPath = this.config.get<string>('WECHAT_MCH_PRIVATE_KEY_PATH', '')

    if (!this.isConfigured()) {
      // 開発環境では証明書が無いのが普通。起動は止めず、決済を呼んだ時点で明確に失敗させる。
      this.logger.warn(
        'WeChat Pay is not fully configured; payment endpoints will return 503. ' +
          'Set WECHAT_MCH_ID / WECHAT_MCH_CERT_SERIAL / WECHAT_API_V3_KEY / WECHAT_MCH_PRIVATE_KEY_PATH to enable.',
      )
    }
  }

  /** 決済に必要な設定が揃っていて、秘密鍵が実在するか */
  isConfigured(): boolean {
    if (
      !this.appId ||
      !this.mchId ||
      !this.serialNo ||
      !this.apiV3Key ||
      !this.notifyUrl ||
      !this.keyPath
    ) {
      return false
    }
    return fs.existsSync(this.keyPath)
  }

  /**
   * 商户 API 秘密鍵。
   *
   * コンストラクタで読み込むと、証明書が無い開発環境でアプリ全体が
   * 起動しなくなる。決済は任意の外部連携なので、実際に決済を呼んだ
   * ときだけ失敗させる。
   */
  private get privateKey(): string {
    if (this.cachedPrivateKey) return this.cachedPrivateKey

    if (!this.isConfigured()) {
      throw new HttpException(
        'WeChat Pay is not configured on this environment',
        HttpStatus.SERVICE_UNAVAILABLE,
      )
    }

    try {
      this.cachedPrivateKey = fs.readFileSync(this.keyPath, 'utf8')
      return this.cachedPrivateKey
    } catch (err) {
      this.logger.error(`failed to read merchant private key at ${this.keyPath}: ${String(err)}`)
      throw new HttpException(
        'WeChat Pay credentials are unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      )
    }
  }

  /**
   * JSAPI（小程序）注文の作成 → wx.requestPayment に渡すパラメータを返す。
   */
  async createJsapiOrder(params: JsapiPrepayParams): Promise<{
    prepayId: string
    payParams: MiniProgramPayParams
  }> {
    const path = '/v3/pay/transactions/jsapi'
    const body = {
      appid: this.appId,
      mchid: this.mchId,
      description: params.description.slice(0, 127),
      out_trade_no: params.outTradeNo,
      notify_url: this.notifyUrl,
      // 未払い注文を放置させないため、既定 30 分で失効させる
      time_expire: (params.timeExpire ?? new Date(Date.now() + 30 * 60 * 1000)).toISOString(),
      amount: {
        total: params.amountCny, // 分単位の整数
        currency: 'CNY',
      },
      payer: { openid: params.openId },
    }

    const response = await this.request<{ prepay_id: string }>('POST', path, body)
    const prepayId = response.prepay_id

    return { prepayId, payParams: this.buildPayParams(prepayId) }
  }

  /**
   * wx.requestPayment 用の署名。
   * 署名対象は「appId\ntimeStamp\nnonceStr\npackage\n」（末尾の改行も必要）。
   */
  private buildPayParams(prepayId: string): MiniProgramPayParams {
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const packageStr = `prepay_id=${prepayId}`

    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`
    const paySign = crypto.createSign('RSA-SHA256').update(message).sign(this.privateKey, 'base64')

    return { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign }
  }

  /** 注文状態の照会。支付通知が届かなかった場合の保険。 */
  async queryOrder(outTradeNo: string): Promise<{ trade_state: string; transaction_id?: string }> {
    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.mchId}`
    return this.request<{ trade_state: string; transaction_id?: string }>('GET', path)
  }

  /**
   * 支付通知の検証と復号。
   *
   * 1. 微信のプラットフォーム証明書で署名を検証（改ざん・なりすまし防止）
   * 2. APIv3 鍵で AES-256-GCM 復号
   *
   * 注意: 署名検証には「パース前の生ボディ」が必要。main.ts で
   * このパスだけ express.raw を適用しているのはそのため。
   */
  decryptNotify(rawBody: Buffer): DecryptedNotify {
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      resource: { ciphertext: string; nonce: string; associated_data: string }
    }

    const { ciphertext, nonce, associated_data: associatedData } = payload.resource
    const buffer = Buffer.from(ciphertext, 'base64')

    // GCM の認証タグは末尾 16 バイト
    const authTag = buffer.subarray(buffer.length - 16)
    const data = buffer.subarray(0, buffer.length - 16)

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.apiV3Key, nonce)
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(associatedData))

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    return JSON.parse(decrypted) as DecryptedNotify
  }

  /**
   * 支付通知の署名検証。
   *
   * platformCertificate は /v3/certificates で取得したプラットフォーム証明書。
   * 実運用では取得結果をキャッシュし、証明書のローテーションに追随させること。
   */
  verifyNotifySignature(
    timestamp: string,
    nonce: string,
    rawBody: string,
    signature: string,
    platformCertificate: string,
  ): boolean {
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(message)
        .verify(platformCertificate, signature, 'base64')
    } catch (err) {
      this.logger.error(`notify signature verification threw: ${String(err)}`)
      return false
    }
  }

  // ----------------------------------------------------------

  /**
   * APIv3 の共通リクエスト。Authorization ヘッダは
   * 「method\nurl\ntimestamp\nnonce\nbody\n」を秘密鍵で署名して作る。
   */
  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const bodyStr = body ? JSON.stringify(body) : ''

    const message = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`
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
      method,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // User-Agent が無いと微信支付は 400 を返す
        'User-Agent': 'health-food-shop/0.1.0',
      },
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(15000),
    })

    const text = await response.text()

    if (!response.ok) {
      this.logger.error(`WeChat Pay ${method} ${path} -> ${response.status}: ${text}`)
      // 微信支付のエラーメッセージをそのまま顧客に見せない（内部情報が混ざるため）
      throw new HttpException('Payment gateway error', HttpStatus.BAD_GATEWAY)
    }

    return JSON.parse(text) as T
  }
}
