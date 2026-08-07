import type { Locale } from '@/types'
import zhCN from './zh-CN'
import jaJP from './ja-JP'

export const DEFAULT_LOCALE: Locale = 'zh-CN'

export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'ja-JP']

export const resources = {
  'zh-CN': zhCN,
  'ja-JP': jaJP,
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
