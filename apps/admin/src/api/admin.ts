import { request } from './client'

/** 管理者トークンが必要なエンドポイント。 */

export interface Overview {
  products: { total: number; active: number; lowStock: number }
  orders: {
    pendingPayment: number
    pendingShipment: number
    shipped: number
    completed: number
  }
  today: { paidOrders: number; paidAmountCny: number }
}

export interface StockBatchRow {
  id: string
  batchNo: string
  expiryDate: string
  quantity: number
  reserved: number
  /** 実際に引き当て可能な数 */
  available: number
  expired: boolean
  warehouse: string | null
}

export interface TaxRateRow {
  id: string
  hsCode: string
  name: Record<string, string>
  tariffRate: number
  vatRate: number
  exciseRate: number
  discount: number
  effectiveRate: number
}

export const adminApi = {
  overview: () => request<Overview>('/admin/overview'),

  updateProduct: (
    id: string,
    body: Partial<{
      priceCny: number
      originalPriceCny: number
      isActive: boolean
      isNew: boolean
      isOnSale: boolean
      hsCode: string
    }>,
  ) => request<unknown>(`/admin/products/${id}`, { method: 'PUT', body }),

  batches: (productId: string) => request<StockBatchRow[]>(`/admin/products/${productId}/batches`),

  addBatch: (
    productId: string,
    body: { batchNo: string; expiryDate: string; quantity: number; warehouse?: string },
  ) => request<unknown>(`/admin/products/${productId}/batches`, { method: 'POST', body }),

  removeBatch: (batchId: string) =>
    request<void>(`/admin/batches/${batchId}`, { method: 'DELETE' }),

  shipOrder: (orderId: string, trackingNo: string) =>
    request<unknown>(`/admin/orders/${orderId}/ship`, {
      method: 'POST',
      body: { trackingNo },
    }),

  taxRates: () => request<TaxRateRow[]>('/admin/tax-rates'),
}
