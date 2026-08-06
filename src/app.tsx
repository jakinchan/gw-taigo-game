import { useEffect, type PropsWithChildren } from 'react'
import Taro, { useLaunch, useError } from '@tarojs/taro'
import { fxApi } from '@/services/api'
import { syncTabBarText, useI18nStore } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { isFxRateStale, setFxRate } from '@/utils/currency'
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

    if (isFxRateStale()) {
      fxApi
        .rate()
        .then(({ rate, quotedAt }) => setFxRate(rate, quotedAt))
        .catch(() => {
          // 取得失敗時は前回値／フォールバック値のまま。JPY 表示は参考値なので致命的ではない。
        })
    }
  })

  // 言語が切り替わったら tabBar のラベルも追随させる
  useEffect(() => {
    syncTabBarText(locale)
  }, [locale])

  useError((error) => {
    // 本番では Sentry 等へ送る。ここではログのみ。
    console.error('[app] uncaught error', error)
  })

  return children
}

export default App
