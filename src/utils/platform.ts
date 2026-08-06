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
