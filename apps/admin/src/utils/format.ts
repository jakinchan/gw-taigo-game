import type { LocalizedText } from '@hfs/shared'

/**
 * 分（CNY の最小単位）→ 表示文字列。
 * 商城側と同じく、金額は整数で扱い浮動小数にしない。
 */
export function formatCny(fen: number): string {
  const sign = fen < 0 ? '-' : ''
  const abs = Math.abs(Math.round(fen))
  return `${sign}¥${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function formatJpy(yen: number): string {
  return `￥${Math.round(yen).toLocaleString('ja-JP')}`
}

/** 管理画面は中国語運用が前提なので簡体字を優先する */
export function tx(text: LocalizedText | Record<string, string> | undefined): string {
  if (!text) return ''
  const record = text as Record<string, string>
  return record['zh-CN'] || record['ja-JP'] || ''
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
