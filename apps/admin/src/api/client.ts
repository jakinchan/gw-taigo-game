import type { ApiResponse } from '@hfs/shared'

/**
 * 管理画面の API クライアント。
 *
 * Vite の proxy 経由なので同一オリジン（/api/...）。
 * 商城側の utils/request.ts とは、認証方式（管理者トークン）と
 * エラー表示のしかたが違うので別実装にしている。
 */

const TOKEN_KEY = 'hfs-admin:token'

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options

  const url = new URL(`/api${path}`, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
  }

  const token = getToken()
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let payload: ApiResponse<T>
  try {
    payload = JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new AdminApiError(res.status, text.slice(0, 200) || 'サーバから不正な応答')
  }

  if (res.status === 401) {
    clearToken()
    throw new AdminApiError(401, '認証が切れました。ログインし直してください。')
  }

  if (!res.ok || payload.code !== 0) {
    throw new AdminApiError(res.status, payload.message || '処理に失敗しました', payload.errorCode)
  }

  return payload.data
}
