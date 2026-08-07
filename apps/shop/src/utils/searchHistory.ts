import { getStorage, setStorage, removeStorage } from './storage'

/**
 * 検索履歴。最大 10 件、新しいものが先頭。
 *
 * 検索語は個人の関心（health food では持病の推測につながりうる）を
 * 示す情報なので、サーバへは送らずローカルにのみ保持する。
 */
const MAX_HISTORY = 10

export function getSearchHistory(): string[] {
  return getStorage('searchHistory') ?? []
}

/** 履歴に追加する。既存の同一語は先頭へ繰り上げる。 */
export function addSearchHistory(keyword: string): string[] {
  const trimmed = keyword.trim()
  if (!trimmed) return getSearchHistory()

  const current = getSearchHistory().filter((item) => item !== trimmed)
  const next = [trimmed, ...current].slice(0, MAX_HISTORY)
  setStorage('searchHistory', next)
  return next
}

export function removeSearchHistory(keyword: string): string[] {
  const next = getSearchHistory().filter((item) => item !== keyword)
  setStorage('searchHistory', next)
  return next
}

export function clearSearchHistory(): void {
  removeStorage('searchHistory')
}
