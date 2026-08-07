import type { Locale } from '@/types'
import zhCN from './zh-CN'
import jaJP from './ja-JP'
import enUS from './en-US'

export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 言語切り替え UI の並び順もこの配列に従う */
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'ja-JP', 'en-US']

export const resources = {
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'en-US': enUS,
} as const

export type Resources = typeof zhCN

/**
 * 'product.addToCart' のようなドット区切りのキーだけを許可する型。
 * 未定義キーを書いた時点でコンパイルエラーになる。
 */
export type TranslationKey = {
  [K in keyof Resources]: {
    [P in keyof Resources[K]]: Resources[K][P] extends string
      ? `${K & string}.${P & string}`
      : `${K & string}.${P & string}.${keyof Resources[K][P] & string}`
  }[keyof Resources[K]]
}[keyof Resources]
