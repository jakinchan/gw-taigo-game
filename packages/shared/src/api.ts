/**
 * API のレスポンス契約。
 * NestJS の ResponseInterceptor / HttpExceptionFilter が返す形と一致させる。
 */

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  /**
   * 業務エラーコード。HTTP ステータスだけでは「なぜ失敗したか」が
   * 分からないため、UI の分岐にはこちらを使う。
   */
  errorCode?: string
  /** limitCny / remainingCny など、エラー表示に使う付随情報 */
  details?: Record<string, unknown>
}

/** サーバが返す業務エラーコード */
export type ApiErrorCode =
  | 'REAL_NAME_REQUIRED'
  | 'SINGLE_LIMIT_EXCEEDED'
  | 'ANNUAL_LIMIT_EXCEEDED'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_ID_CARD'
  | 'NOT_ENOUGH_POINTS'
  | 'NO_DRAW_CHANCE'

export interface Paginated<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
