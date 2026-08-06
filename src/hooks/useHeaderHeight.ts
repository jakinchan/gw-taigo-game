import { useMemo } from 'react'
import Taro from '@tarojs/taro'

/**
 * カスタムヘッダー（components/Header）の実高さ。
 *
 * Header は position: fixed なので、ページ側は同じ高さの
 * プレースホルダを置かないとコンテンツがヘッダーの下に潜る。
 * 計算式を Header と 2 箇所に散らさないよう、ここに集約する。
 */
export function useHeaderHeight(options: { withSearch?: boolean } = {}): number {
  const { withSearch = true } = options

  return useMemo(() => {
    let statusBarHeight = 20
    try {
      statusBarHeight = Taro.getSystemInfoSync().statusBarHeight ?? 20
    } catch {
      /* fallthrough */
    }

    let capsuleHeight = 32
    let capsuleTop = statusBarHeight + 4
    try {
      const rect = Taro.getMenuButtonBoundingClientRect?.()
      if (rect && rect.height > 0) {
        capsuleHeight = rect.height
        capsuleTop = rect.top
      }
    } catch {
      /* fallthrough */
    }

    const navRowHeight = capsuleHeight + (capsuleTop - statusBarHeight) * 2
    // 検索行 = padding-top 8 + 検索バー 36 + padding-bottom 12
    const searchRowHeight = withSearch ? 8 + 36 + 12 : 0

    return statusBarHeight + navRowHeight + searchRowHeight
  }, [withSearch])
}
