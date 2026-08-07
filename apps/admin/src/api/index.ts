import type { Category, Order, OrderStatus, Paginated, Product } from '@hfs/shared'
import { request } from './client'

/**
 * 管理画面が使うエンドポイント。
 *
 * 現時点では商城と同じ公開 API を読んでいる。
 * 更新系（商品の登録・在庫調整・出荷）は管理者権限付きの
 * /api/admin/* を別途用意する必要がある（README の TODO を参照）。
 */

export const catalogApi = {
  categories: () => request<Category[]>('/categories'),

  products: (params: { keyword?: string; categoryId?: string; page?: number }) =>
    request<Paginated<Product>>('/products', {
      query: { ...params, pageSize: 50 },
    }),

  product: (id: string) => request<Product>(`/products/${id}`),
}

export const orderApi = {
  list: (params: { status?: OrderStatus; page?: number }) =>
    request<Paginated<Order>>('/orders', { query: params }),

  detail: (id: string) => request<Order>(`/orders/${id}`),
}

export const fxApi = {
  rate: () => request<{ rate: number; quotedAt: string; source: string }>('/fx/cny-jpy'),
}

export const lotteryApi = {
  board: () =>
    request<{
      prizes: { id: string; name: Record<string, string>; type: string; slot: number }[]
      pointsPerDraw: number
      maxDrawsPerDay: number
    }>('/lottery/board'),
}
