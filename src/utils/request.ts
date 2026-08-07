import Taro from '@tarojs/taro'
import type { ApiErrorCode, ApiResponse } from '@/types'
import { getCache, getStorage, removeStorage, setCache } from './storage'

declare const API_BASE_URL: string

/**
 * ビルド時に defineConstants で注入される値。
 * 注入に失敗している場合（config の読み込みミスなど）に
 * ReferenceError で全 API が死ぬのを避け、既定値へ落とす。
 */
const BASE_URL: string = (() => {
  try {
    return API_BASE_URL
  } catch {
    console.error(
      '[request] API_BASE_URL was not injected at build time; ' +
        'check defineConstants in config/dev.ts and config/prod.ts',
    )
    return 'http://localhost:3000/api'
  }
})()

/** 業務エラー。HTTP 200 だが code !== 0 のケースと、HTTP エラーの両方を表す。 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus?: number,
    /**
     * サーバが返す業務エラーコード。UI の分岐はこれで行う。
     * 例: 'REAL_NAME_REQUIRED' → 実名認証画面へ誘導
     */
    public readonly errorCode?: string,
    /** limitCny / remainingCny など、エラー表示に使う付随情報 */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  /** 認証必須のエンドポイントか。true で未ログインならログインを試みる。 */
  auth?: boolean
  /** GET のみ有効。指定ミリ秒だけレスポンスをローカルキャッシュする。 */
  cacheTtlMs?: number
  /** ミリ秒。既定 10 秒。 */
  timeout?: number
}

/** 401 が来たときに 1 度だけ再ログインするためのフラグ（多重ログイン防止） */
let refreshing: Promise<string | null> | null = null

/**
 * 微信のログインフローで JWT を取得する。
 *   wx.login → code → バックエンド /auth/login → code2session → JWT
 * code は 5 分で失効し 1 度しか使えないため、必ずその場でサーバへ渡す。
 */
export async function login(): Promise<string | null> {
  if (refreshing) return refreshing

  refreshing = (async () => {
    try {
      /**
       * H5 やブラウザプレビューには微信のログインが存在せず、
       * Taro.login は「暂时不支持 API」で reject する。
       * これは環境の制約であってアプリの障害ではないので、
       * console.error にはせず、未ログインとして静かに扱う。
       */
      const { code } = await Taro.login()
      if (!code) return null

      const res = await Taro.request<ApiResponse<{ token: string }>>({
        url: `${BASE_URL}/auth/login`,
        method: 'POST',
        data: { code },
        timeout: 10000,
      })

      if (res.statusCode === 200 && res.data.code === 0) {
        const { token } = res.data.data
        Taro.setStorageSync('hfs:token', token)
        return token
      }
      return null
    } catch (err) {
      const errMsg = (err as { errMsg?: string })?.errMsg ?? ''
      if (errMsg.includes('不支持') || errMsg.includes('not supported')) {
        // 微信の外（H5 プレビューなど）。未ログインのまま動かす。
        console.info('[request] WeChat login is unavailable on this platform; staying signed out')
      } else {
        console.error('[request] login failed', err)
      }
      return null
    } finally {
      // 次回の 401 で再試行できるように解放する
      setTimeout(() => {
        refreshing = null
      }, 0)
    }
  })()

  return refreshing
}

async function send<T>(path: string, options: RequestOptions, retried = false): Promise<T> {
  const { method = 'GET', data, auth = false, timeout = 10000 } = options

  let token = getStorage('token')
  if (auth && !token) {
    token = await login()
  }

  const res = await Taro.request<ApiResponse<T>>({
    url: `${BASE_URL}${path}`,
    method,
    data,
    timeout,
    header: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  // --- 認証切れ: 1 度だけ再ログインしてリトライ ---
  if (res.statusCode === 401 && !retried) {
    removeStorage('token')
    const fresh = await login()
    if (fresh) return send<T>(path, options, true)
    throw new ApiError(401, 'unauthorized', 401)
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new ApiError(
      res.statusCode,
      res.data?.message ?? 'HTTP error',
      res.statusCode,
      res.data?.errorCode,
      res.data?.details,
    )
  }

  const body = res.data
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message, res.statusCode, body.errorCode, body.details)
  }

  return body.data
}

/**
 * API クライアントの唯一の入口。
 * ここで「キャッシュ → 通信 → エラー正規化」を一元化しているので、
 * 呼び出し側は try/catch と ApiError だけを知っていればよい。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, cacheTtlMs } = options

  const cacheKey = cacheTtlMs ? `${method}:${path}:${JSON.stringify(data ?? {})}` : null
  if (cacheKey) {
    const cached = getCache<T>(cacheKey)
    if (cached !== null) return cached
  }

  const result = await send<T>(path, options)

  if (cacheKey && cacheTtlMs) {
    setCache(cacheKey, result, cacheTtlMs)
  }

  return result
}

/** ネットワーク例外・業務エラーをユーザー向け文言に落とす */
export function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

/**
 * 業務エラーコードで分岐したいときに使う。
 * @example if (isErrorCode(err, 'REAL_NAME_REQUIRED')) goVerify()
 */
export function isErrorCode(err: unknown, code: ApiErrorCode): boolean {
  return err instanceof ApiError && err.errorCode === code
}
