import type {
  Address,
  Category,
  Coupon,
  LocalizedText,
  Order,
  OrderStatus,
  Paginated,
  Product,
  ProductQuery,
  Review,
  ShippingMethod,
  UserProfile,
} from '@/types'
import { request } from '@/utils/request'
import * as mock from './mock'

/**
 * バックエンド（NestJS）の REST API クライアント。
 * キャッシュ TTL はここで一元管理する。
 *   - マスタ系（カテゴリ/商品）は長め
 *   - 在庫や注文など可変データはキャッシュしない
 */

const TTL = {
  categories: 30 * 60 * 1000, // 30 分
  productList: 3 * 60 * 1000, // 3 分
  productDetail: 60 * 1000, // 1 分（在庫が含まれるため短く）
} as const

/**
 * 開発中にバックエンド未起動でも画面を確認できるようにする。
 * 本番ビルドではフォールバックせず、そのままエラーを投げる
 * （在庫や価格の偽データを本番で見せないため）。
 */
async function withMockFallback<T>(promise: Promise<T>, mock: () => T): Promise<T> {
  try {
    return await promise
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[api] falling back to mock data:', err)
      return mock()
    }
    throw err
  }
}

function paginate<T>(list: T[]): Paginated<T> {
  return { list, total: list.length, page: 1, pageSize: list.length, hasMore: false }
}

// ------------------------------------------------------------
// 商品
// ------------------------------------------------------------

export const productApi = {
  categories: () =>
    withMockFallback(
      request<Category[]>('/categories', { cacheTtlMs: TTL.categories }),
      () => mock.mockCategories,
    ),

  list: (query: ProductQuery = {}) =>
    withMockFallback(
      request<Paginated<Product>>('/products', {
        data: query as Record<string, unknown>,
        cacheTtlMs: query.keyword ? undefined : TTL.productList,
      }),
      () =>
        paginate(
          mock.mockProducts.filter(
            (p) => !query.categoryId || p.categoryId === query.categoryId,
          ),
        ),
    ),

  detail: (id: string) =>
    withMockFallback(
      request<Product>(`/products/${id}`, { cacheTtlMs: TTL.productDetail }),
      () => mock.mockProducts.find((p) => p.id === id) ?? mock.mockProducts[0],
    ),

  /** トップページ用。おすすめ・新着・セールを 1 リクエストでまとめて取る。 */
  homeFeed: () =>
    withMockFallback(
      request<{
        banners: { id: string; image: string; link: string }[]
        categories: Category[]
        recommended: Product[]
        newArrivals: Product[]
        onSale: Product[]
      }>('/home-feed', { cacheTtlMs: TTL.productList }),
      () => ({
        banners: mock.mockBanners,
        categories: mock.mockCategories,
        recommended: mock.mockProducts.slice(0, 4),
        newArrivals: mock.mockProducts.filter((p) => p.isNew),
        onSale: mock.mockProducts.filter((p) => p.isOnSale),
      }),
    ),

  reviews: (productId: string, page = 1) =>
    withMockFallback(
      request<Paginated<Review>>(`/products/${productId}/reviews`, { data: { page } }),
      () => paginate(mock.mockReviews),
    ),

  related: (productId: string) =>
    withMockFallback(
      request<Product[]>(`/products/${productId}/related`, { cacheTtlMs: TTL.productList }),
      () => mock.mockProducts.filter((p) => p.id !== productId).slice(0, 4),
    ),
}

// ------------------------------------------------------------
// ユーザー・住所
// ------------------------------------------------------------

export const userApi = {
  profile: () => request<UserProfile>('/users/me', { auth: true }),

  updateProfile: (data: { nickname?: string; avatar?: string }) =>
    request<UserProfile>('/users/me', { method: 'PUT', data, auth: true }),

  addresses: () => request<Address[]>('/users/me/addresses', { auth: true }),

  createAddress: (data: Omit<Address, 'id'>) =>
    request<Address>('/users/me/addresses', {
      method: 'POST',
      data: data as unknown as Record<string, unknown>,
      auth: true,
    }),

  updateAddress: (id: string, data: Partial<Address>) =>
    request<Address>(`/users/me/addresses/${id}`, {
      method: 'PUT',
      data: data as Record<string, unknown>,
      auth: true,
    }),

  deleteAddress: (id: string) =>
    request<void>(`/users/me/addresses/${id}`, { method: 'DELETE', auth: true }),

  coupons: () => request<Coupon[]>('/users/me/coupons', { auth: true }),

  /** クーポンコードの検証。カート画面での「使用」ボタン用。 */
  validateCoupon: (code: string, subtotalCny: number) =>
    request<Coupon & { discountCny: number }>('/coupons/validate', {
      method: 'POST',
      data: { code, subtotalCny },
      auth: true,
    }),
}

// ------------------------------------------------------------
// 注文
// ------------------------------------------------------------

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[]
  addressId: string
  shippingMethod: ShippingMethod
  couponCode?: string
  remark?: string
}

export const orderApi = {
  /**
   * 注文プレビュー。送料・税・割引をサーバ側で計算させる。
   * 金額計算をクライアントで完結させないこと（改ざん耐性のため）。
   */
  preview: (payload: Omit<CreateOrderPayload, 'remark'>) =>
    request<Order>('/orders/preview', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
      auth: true,
    }),

  create: (payload: CreateOrderPayload) =>
    request<Order>('/orders', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
      auth: true,
    }),

  list: (status?: OrderStatus, page = 1) =>
    request<Paginated<Order>>('/orders', { data: { status, page }, auth: true }),

  detail: (id: string) => request<Order>(`/orders/${id}`, { auth: true }),

  cancel: (id: string) =>
    request<Order>(`/orders/${id}/cancel`, { method: 'POST', auth: true }),
}

// ------------------------------------------------------------
// 抽選
// ------------------------------------------------------------

export type PrizeType = 'points' | 'coupon' | 'product' | 'free_order' | 'luck' | 'none'

export interface LotteryPrizeSlot {
  id: string
  name: LocalizedText
  type: PrizeType
  /** 抽選盤上の位置（0-8、中央の 4 は除く） */
  slot: number
}

export interface DrawResult {
  prizeId: string
  slot: number
  name: LocalizedText
  type: PrizeType
  pointsCost: number
  pointsBalance: number
  remainingToday: number
}

export const lotteryApi = {
  /** 賞品一覧。当選確率と在庫はサーバ側に隠されている。 */
  board: () =>
    request<{
      prizes: LotteryPrizeSlot[]
      pointsPerDraw: number
      maxDrawsPerDay: number
    }>('/lottery/board', { cacheTtlMs: 10 * 60 * 1000 }),

  status: () =>
    request<{ points: number; remainingToday: number; pointsPerDraw: number }>(
      '/lottery/status',
      { auth: true },
    ),

  /**
   * 抽選の実行。当選判定はサーバが行う。
   * idempotencyKey は再送時に同じ値を送ること（二重消費の防止）。
   */
  draw: (idempotencyKey: string) =>
    request<DrawResult>('/lottery/draw', {
      method: 'POST',
      data: { idempotencyKey },
      auth: true,
    }),

  prizes: (page = 1) =>
    request<Paginated<{ id: string; name: LocalizedText; type: PrizeType; claimed: boolean; createdAt: string }>>(
      '/lottery/prizes',
      { data: { page }, auth: true },
    ),
}

