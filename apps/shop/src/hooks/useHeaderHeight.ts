import { useMemo } from 'react'
import { getNavRowHeight, getScreenMetrics } from '@/utils/platform'

/** 検索行の高さ = 上padding 8 + 検索バー 36 + 下padding 12 */
const SEARCH_ROW_HEIGHT = 8 + 36 + 12

/**
 * カスタムヘッダー（components/BrandHeader）の実高さ。
 *
 * BrandHeader は position: fixed なので、ページ側は同じ高さの
 * プレースホルダを置かないとコンテンツがヘッダーの下に潜る。
 * 計算式を 2 箇所に散らさないよう、ここに集約する。
 */
export function useHeaderHeight(options: { withSearch?: boolean } = {}): number {
  const { withSearch = true } = options

  return useMemo(() => {
    const screen = getScreenMetrics()
    return (
      screen.statusBarHeight +
      getNavRowHeight(screen) +
      (withSearch ? SEARCH_ROW_HEIGHT : 0)
    )
  }, [withSearch])
}
