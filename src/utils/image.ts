/**
 * 画像 URL の最適化。
 *
 * 前提: 画像 CDN（阿里云 OSS / 腾讯云 COS / 七牛など）の
 * 「画像処理パラメータ」を URL クエリで渡す方式を使う。
 * CDN を変える場合はこの 1 ファイルだけ書き換えればよい。
 */

export interface ImageOptions {
  /** 出力幅（デザイン px。実際は DPR 倍でリクエストする） */
  width?: number
  /** 出力高さ */
  height?: number
  /** 1-100。既定 80 */
  quality?: number
  /** WebP に変換するか。既定 true。 */
  webp?: boolean
}

/** 端末の DPR。3 倍を超えると転送量が無駄なので 3 で頭打ちにする。 */
let dpr = 2
export function setDevicePixelRatio(value: number): void {
  dpr = Math.min(Math.max(Math.round(value), 1), 3)
}

/**
 * @example imageUrl(product.thumbnail, { width: 168, height: 168 })
 *   → https://cdn.../a.jpg?x-oss-process=image/resize,w_336,h_336/format,webp/quality,q_80
 */
export function imageUrl(src: string, options: ImageOptions = {}): string {
  if (!src) return ''
  // data URI / ローカルアセットは加工しない
  if (src.startsWith('data:') || !src.startsWith('http')) return src

  const { width, height, quality = 80, webp = true } = options
  const ops: string[] = []

  if (width || height) {
    const parts = ['resize']
    if (width) parts.push(`w_${Math.round(width * dpr)}`)
    if (height) parts.push(`h_${Math.round(height * dpr)}`)
    parts.push('m_fill') // 指定サイズに切り抜きフィット
    ops.push(parts.join(','))
  }
  if (webp) ops.push('format,webp')
  ops.push(`quality,q_${quality}`)

  const separator = src.includes('?') ? '&' : '?'
  return `${src}${separator}x-oss-process=image/${ops.join('/')}`
}

/** よく使うサイズのプリセット（仕様: 横 750px / 縦 500px 以内） */
export const IMAGE_PRESET = {
  banner: { width: 375, height: 160 },
  productThumb: { width: 168, height: 168 },
  productDetail: { width: 375, height: 250 },
  categoryIcon: { width: 48, height: 48 },
  avatar: { width: 60, height: 60 },
} as const
