import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * 取得・ローディング・エラーの決まりきった 3 状態をまとめる。
 * 各画面で同じ useState を 3 つ書くと、エラー表示を書き忘れる画面が必ず出る。
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // fetcher は毎レンダー新しくなるので、依存は呼び出し側の deps に任せる
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    run()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [run, nonce])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}
