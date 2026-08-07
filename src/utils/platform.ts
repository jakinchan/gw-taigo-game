import Taro from '@tarojs/taro'

/**
 * プラットフォーム差を吸収するヘルパー。
 *
 * Taro の API は小程序では Promise を返すが、H5 では同期に実装されていて
 * undefined を返すものがある。戻り値にそのまま `.catch()` を繋ぐと
 * H5 で TypeError になり、未処理の rejection として開発中ずっと
 * エラーオーバーレイが出続ける。
 */

/**
 * 失敗しても無視してよい Taro API 呼び出しを安全に実行する。
 *
 * @example ignoreFailure(() => Taro.vibrateShort({ type: 'light' }))
 */
export function ignoreFailure(call: () => unknown): void {
  try {
    const result = call()
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {
        /* 意図的に無視する */
      })
    }
  } catch {
    /* 同期例外も無視する */
  }
}

/** 画面上部の実測値。小程序と H5 の差を吸収した後の値。 */
export interface ScreenMetrics {
  /** ステータスバーの高さ */
  statusBarHeight: number
  screenWidth: number
  /** 右上のカプセルボタン。H5 には存在しないので null。 */
  capsule: { top: number; height: number; left: number; width: number } | null
}

/**
 * ステータスバーとカプセルボタンの実測値を取る。
 *
 * getMenuButtonBoundingClientRect は H5 では
 * 「暂时不支持 API」で **Promise を reject する**。
 * 同期関数のつもりで try/catch しても捕まらず、未処理の rejection として
 * 開発中ずっとエラーオーバーレイが出続ける。
 * 戻り値が Promise なら「非対応」と判断して null を返す。
 */
export function getScreenMetrics(): ScreenMetrics {
  let statusBarHeight = 20
  let screenWidth = 375

  try {
    const info = Taro.getSystemInfoSync()
    statusBarHeight = info.statusBarHeight ?? 20
    screenWidth = info.screenWidth ?? 375
  } catch {
    /* 取得できない環境は既定値のまま */
  }

  let capsule: ScreenMetrics['capsule'] = null
  try {
    const rect = Taro.getMenuButtonBoundingClientRect?.() as
      | ScreenMetrics['capsule']
      | Promise<unknown>
      | undefined

    if (rect && typeof (rect as Promise<unknown>).then === 'function') {
      // H5 の非対応スタブ。放置すると未処理 rejection になるので握り潰す。
      void (rect as Promise<unknown>).catch(() => {})
    } else if (rect && (rect as NonNullable<ScreenMetrics['capsule']>).height > 0) {
      capsule = rect as NonNullable<ScreenMetrics['capsule']>
    }
  } catch {
    /* 非対応環境 */
  }

  return { statusBarHeight, screenWidth, capsule }
}

/**
 * カスタムヘッダーのブランド行の高さ。
 * カプセルがあればその上下に等しい余白を取り、無ければ標準的な 44pt。
 */
export function getNavRowHeight(metrics: ScreenMetrics): number {
  if (!metrics.capsule) return 44
  return metrics.capsule.height + (metrics.capsule.top - metrics.statusBarHeight) * 2
}
