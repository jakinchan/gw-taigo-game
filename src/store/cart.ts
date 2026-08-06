import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { CartItem, Product } from '@/types'
import { getStorage, setStorage } from '@/utils/storage'

/**
 * カート。
 * ローカル永続化のみで、サーバ同期はしない（未ログインでも使えるようにするため）。
 * 注文作成時に productId + quantity をサーバへ送り、価格と在庫はサーバが再検証する。
 */

interface CartState {
  items: CartItem[]
  add: (product: Product, quantity: number) => void
  remove: (productId: string) => void
  removeSelected: () => void
  setQuantity: (productId: string, quantity: number) => void
  toggleSelect: (productId: string) => void
  toggleSelectAll: (selected: boolean) => void
  clear: () => void
  /** 決済完了した商品だけをカートから取り除く */
  removeMany: (productIds: string[]) => void
}

function persist(items: CartItem[]): CartItem[] {
  setStorage('cart', items)
  // タブバーのバッジを商品点数（種類数ではなく合計個数）で更新
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  if (count > 0) {
    Taro.setTabBarBadge({ index: 2, text: count > 99 ? '99+' : String(count) }).catch(() => {})
  } else {
    Taro.removeTabBarBadge({ index: 2 }).catch(() => {})
  }
  return items
}

export const useCartStore = create<CartState>((set, get) => ({
  items: getStorage('cart') ?? [],

  add: (product, quantity) => {
    const items = [...get().items]
    const existing = items.find((item) => item.productId === product.id)

    if (existing) {
      // 在庫を超えないようにクランプする
      existing.quantity = Math.min(existing.quantity + quantity, product.stock)
      existing.selected = true
    } else {
      items.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        thumbnail: product.thumbnail,
        priceCny: product.priceCny,
        quantity: Math.min(quantity, product.stock),
        stock: product.stock,
        selected: true,
      })
    }
    set({ items: persist(items) })
  },

  remove: (productId) => {
    set({ items: persist(get().items.filter((item) => item.productId !== productId)) })
  },

  removeMany: (productIds) => {
    const ids = new Set(productIds)
    set({ items: persist(get().items.filter((item) => !ids.has(item.productId))) })
  },

  removeSelected: () => {
    set({ items: persist(get().items.filter((item) => !item.selected)) })
  },

  setQuantity: (productId, quantity) => {
    const items = get().items.map((item) =>
      item.productId === productId
        ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) }
        : item,
    )
    set({ items: persist(items) })
  },

  toggleSelect: (productId) => {
    const items = get().items.map((item) =>
      item.productId === productId ? { ...item, selected: !item.selected } : item,
    )
    set({ items: persist(items) })
  },

  toggleSelectAll: (selected) => {
    set({ items: persist(get().items.map((item) => ({ ...item, selected }))) })
  },

  clear: () => set({ items: persist([]) }),
}))

// ------------------------------------------------------------
// 派生値（セレクタ）
// ------------------------------------------------------------

export function selectSelectedItems(state: CartState): CartItem[] {
  return state.items.filter((item) => item.selected)
}

/** 選択中商品の小計（分） */
export function selectSubtotalCny(state: CartState): number {
  return state.items
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + item.priceCny * item.quantity, 0)
}

/** カート内の合計個数 */
export function selectTotalCount(state: CartState): number {
  return state.items.reduce((sum, item) => sum + item.quantity, 0)
}

export function selectAllSelected(state: CartState): boolean {
  return state.items.length > 0 && state.items.every((item) => item.selected)
}
