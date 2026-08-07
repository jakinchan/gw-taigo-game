import Taro from '@tarojs/taro'
import type { Order, WechatPayParams } from '@/types'
import { ApiError, request } from '@/utils/request'

/**
 * WeChat Pay（小程序支付 / 越境決済）連携。
 *
 * ■ 越境決済（跨境支付）の全体像
 *   1. 顧客は人民元（CNY）建てで表示された金額を微信支付で支払う。
 *   2. 微信支付は「境外收单」加盟店として登録された加盟店に対し、
 *      CNY で受領した資金を加盟店の決済通貨（ここでは JPY）へ換算して入金する。
 *   3. 換算レート・タイミングは微信支付／決済代行（SBPS 等）側が確定させる。
 *      → 小程序側で表示する JPY 額はあくまで参考値であり、
 *        入金額と一致することを保証してはならない。
 *
 * ■ 署名について
 *   paySign は必ずサーバ側（APIv3 秘密鍵を持つ NestJS）で生成する。
 *   秘密鍵を小程序に埋め込むと、パッケージを解析されて悪用される。
 *
 * 参考: https://developer.sbpayment.jp/en/payment-service/overseas/wechat-pay/4973/
 */

/** 決済結果。UI 側は理由で分岐して表示を変える。 */
export type PayResult =
  | { status: 'success'; orderNo: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }

/**
 * 決済パラメータをサーバから取得する。
 * サーバ側で /v3/pay/transactions/jsapi を叩き prepay_id を得て、
 * それを署名した結果が返る。
 */
export async function createPayment(orderNo: string): Promise<WechatPayParams> {
  return request<WechatPayParams>('/payment/wechat', {
    method: 'POST',
    data: { orderNo },
    auth: true,
  })
}

/**
 * 決済を実行する。
 *
 * 注意: wx.requestPayment の success は「決済ダイアログが正常に閉じた」ことしか
 * 保証しない。入金確定は微信からサーバへの支付通知（notify）が正本なので、
 * 成功後は必ずサーバに注文状態を問い合わせて確定させる。
 */
export async function payOrder(order: Order): Promise<PayResult> {
  try {
    const params = await createPayment(order.orderNo)

    await Taro.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
    })

    // 決済ダイアログは閉じた。サーバ側の注文状態で最終確定する。
    const confirmed = await confirmPaymentStatus(order.orderNo)
    return confirmed
      ? { status: 'success', orderNo: order.orderNo }
      : { status: 'failed', reason: 'payment_not_confirmed' }
  } catch (err) {
    // 微信はユーザーキャンセルを errMsg に 'cancel' を含む形で返す
    const errMsg = (err as { errMsg?: string })?.errMsg ?? ''
    if (errMsg.includes('cancel')) {
      return { status: 'cancelled' }
    }
    if (err instanceof ApiError) {
      return { status: 'failed', reason: err.message }
    }
    console.error('[wechatPay] requestPayment failed', err)
    return { status: 'failed', reason: errMsg || 'unknown_error' }
  }
}

/**
 * 支付通知はサーバに非同期で届くため、着信までに数百ミリ秒〜数秒かかる。
 * 指数バックオフで最大 5 回ポーリングする。
 */
async function confirmPaymentStatus(orderNo: string, maxAttempts = 5): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { paid } = await request<{ paid: boolean }>(`/payment/status/${orderNo}`, {
        auth: true,
      })
      if (paid) return true
    } catch (err) {
      console.warn('[wechatPay] status poll failed', err)
    }
    await sleep(400 * 2 ** attempt) // 400ms, 800ms, 1.6s, 3.2s, 6.4s
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 決済ページで表示する「参考 JPY 額」をサーバに再問い合わせする。
 * 表示のブレを避けるため、注文作成時にサーバが確定させたレートを使う。
 */
export async function getSettlementQuote(orderNo: string) {
  return request<{
    chargeCny: number
    estimatedSettlementJpy: number
    fxRate: number
    quotedAt: string
    provider: 'wechat_direct' | 'sbps'
  }>(`/payment/quote/${orderNo}`, { auth: true })
}
