import { getStorage, setStorage } from './storage'

/**
 * 通貨ユーティリティ。
 *
 * 設計上の大前提:
 *   - 金額は常に「最小通貨単位の整数」で保持する（CNY = 分, JPY = 円）。
 *     浮動小数で金額を持つと 0.1 + 0.2 問題で 1 分ずれ、決済照合が壊れる。
 *   - JPY 換算は "参考表示" にすぎない。実際の決済は WeChat Pay 側で
 *     人民元建て（越境の場合は加盟店の決済通貨）で確定するため、
 *     アプリ側の換算値を請求額として使ってはならない。
 */

/** レートのフォールバック値。起動直後に API から取得できるまでの暫定値。 */
const FALLBACK_CNY_TO_JPY = 21.0

/** レートの有効期間。これを過ぎたら再取得する（6 時間）。 */
export const FX_RATE_TTL_MS = 6 * 60 * 60 * 1000

/** 1 CNY = ? JPY */
let currentRate: number = getStorage('fxRate')?.rate ?? FALLBACK_CNY_TO_JPY
let quotedAt: string = getStorage('fxRate')?.quotedAt ?? ''

export function getFxRate(): number {
  return currentRate
}

export function getFxQuotedAt(): string {
  return quotedAt
}

/** レートが古い（または未取得）かどうか */
export function isFxRateStale(): boolean {
  if (!quotedAt) return true
  return Date.now() - new Date(quotedAt).getTime() > FX_RATE_TTL_MS
}

/** バックエンドから取得したレートを適用する */
export function setFxRate(rate: number, at: string = new Date().toISOString()): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    console.warn('[currency] invalid fx rate ignored:', rate)
    return
  }
  currentRate = rate
  quotedAt = at
  setStorage('fxRate', { rate, quotedAt: at })
}

/**
 * 分（CNY 最小単位）→ 表示文字列。
 * @example formatCny(12800) // '128.00'
 */
export function formatCny(fen: number, withSymbol = false): string {
  const sign = fen < 0 ? '-' : ''
  const abs = Math.abs(Math.round(fen))
  const yuan = Math.floor(abs / 100)
  const cents = abs % 100
  const body = `${yuan}.${String(cents).padStart(2, '0')}`
  return withSymbol ? `${sign}¥${body}` : `${sign}${body}`
}

/** 整数部と小数部を分けて返す。価格表示で小数部を小さく描画するため。 */
export function splitCny(fen: number): { integer: string; decimal: string } {
  const abs = Math.abs(Math.round(fen))
  return {
    integer: String(Math.floor(abs / 100)),
    decimal: String(abs % 100).padStart(2, '0'),
  }
}

/**
 * CNY（分）→ JPY（円）。
 * 円は最小単位が 1 円なので四捨五入して整数化する。
 */
export function cnyToJpy(fen: number, rate: number = currentRate): number {
  return Math.round((fen / 100) * rate)
}

/** JPY（円）を 3 桁区切りで表示 */
export function formatJpy(yen: number, withSymbol = false): string {
  const sign = yen < 0 ? '-' : ''
  const body = Math.abs(Math.round(yen))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return withSymbol ? `${sign}￥${body}` : `${sign}${body}`
}

/**
 * 「¥128.00（約 ￥2,688）」のような併記文字列を作る。
 * @param showJpy false の場合は CNY のみ返す
 */
export function formatDualPrice(fen: number, showJpy: boolean, approxLabel = '约'): string {
  const cny = `¥${formatCny(fen)}`
  if (!showJpy) return cny
  return `${cny}（${approxLabel} ￥${formatJpy(cnyToJpy(fen))}）`
}
