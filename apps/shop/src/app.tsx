import { useEffect, type PropsWithChildren } from 'react'
import Taro, { useLaunch, useError } from '@tarojs/taro'
import { syncTabBarText, useI18nStore } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { setDevicePixelRatio } from '@/utils/image'

import './app.scss'

/**
 * アプリのルート。
 * 起動時にやることは 3 つだけに絞っている:
 *   1. 保存済みの言語を tabBar に反映
 *   2. 為替レートの更新（表示用の参考値）
 *   3. トークンがあればユーザー情報の静かな復元
 * いずれも失敗してもアプリは動作し続ける（起動をブロックしない）。
 */
function App({ children }: PropsWithChildren) {
  const locale = useI18nStore((s) => s.locale)
  const restoreUser = useUserStore((s) => s.restore)

  useLaunch(() => {
    // 端末の DPR を画像 URL 生成へ伝える（過剰な解像度の画像を落とさないため）
    try {
      setDevicePixelRatio(Taro.getSystemInfoSync().pixelRatio ?? 2)
    } catch {
      /* 取れない環境は既定の 2 倍のまま */
    }

    // 起動直後は tabBar がまだ生成されていないことがあるため、次のタスクで実行する
    setTimeout(() => syncTabBarText(locale), 0)

    void restoreUser()
  })

  // 言語が切り替わったら tabBar のラベルも追随させる
  useEffect(() => {
    syncTabBarText(locale)
  }, [locale])

  useError((error) => {
    /**
     * Taro は H5 で、画像の読み込み失敗のような「reason を持たない
     * リソースエラー」もここへ流してくる。これをアプリ例外として
     * 記録すると本物のエラーが埋もれるので落とす。
     * 画像の失敗は SafeImage がプレースホルダで処理済み。
     */
    if (error === undefined || error === null) return

    // 本番では Sentry 等へ送る。`[object Object]` だと調査できないので整形する。
    const detail =
      typeof error === 'object'
        ? JSON.stringify(error, Object.getOwnPropertyNames(error as object))
        : String(error)
    console.error('[app] uncaught error:', detail)
  })

  return children
}

export default App
