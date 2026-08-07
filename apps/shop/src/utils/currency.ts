/**
 * 通貨ユーティリティ。
 *
 * 設計上の大前提:
 *   - 金額は常に「分」（CNY の最小通貨単位）の整数で保持する。
 *     浮動小数で金額を持つと 0.1 + 0.2 問題で 1 分ずれ、決済照合が壊れる。
 *   - 顧客が支払うのは常に人民元。加盟店への入金通貨（越境なら JPY 等）は
 *     微信支付との契約事項で、精算時に微信支付／決済代行が確定させる。
 *     アプリはそこに関与しないので、外貨の換算表示も持たない。
 */

/**
 * 分 → 表示文字列。
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
