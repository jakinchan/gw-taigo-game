import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { Locale, LocalizedText } from '@/types'
import { DEFAULT_LOCALE, resources, type TranslationKey } from '@/locales'
import { getStorage, setStorage } from '@/utils/storage'

/**
 * 軽量 i18n。
 *
 * i18next を使わない理由: 小程序はパッケージ全体で 2MB（メインパッケージ）の
 * 上限がある。辞書の入れ替えとフォーマットしか要らないため、
 * 自前実装のほうが数十 KB 単位で得をする。
 */

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

/** 保存済みの言語 → 端末の言語 → 既定（簡体中国語）の順で解決する */
function resolveInitialLocale(): Locale {
  const saved = getStorage('locale')
  if (saved && saved in resources) return saved

  try {
    const systemLanguage = Taro.getSystemInfoSync().language ?? ''
    if (systemLanguage.startsWith('ja')) return 'ja-JP'
  } catch {
    /* getSystemInfoSync が使えない環境は既定にフォールバック */
  }
  return DEFAULT_LOCALE
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: resolveInitialLocale(),
  setLocale: (locale) => {
    setStorage('locale', locale)
    set({ locale })
    syncTabBarText(locale)
  },
}))

/**
 * ネイティブ tabBar のラベルは app.config.ts に静的に書かれているため、
 * 言語切り替え時に API で書き換える必要がある。
 */
export function syncTabBarText(locale: Locale): void {
  const t = resources[locale].tabBar
  const labels = [t.home, t.category, t.cart, t.user]
  labels.forEach((text, index) => {
    Taro.setTabBarItem({ index, text }).catch(() => {
      // tabBar を持たないページから呼ばれた場合は無視してよい
    })
  })
}

/** キーからネストした値を引く。存在しなければキー自体を返す（本番で落とさない）。 */
function lookup(locale: Locale, key: string): string {
  const parts = key.split('.')
  let node: unknown = resources[locale]
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return key
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : key
}

/**
 * 翻訳関数。`{name}` 形式のプレースホルダに対応。
 * @example t('cart.total') / t('product.stock', { count: 12 })
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let text = lookup(locale, key)
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
  }
  return text
}

/**
 * React フック。コンポーネントは `const { t, locale } = useI18n()` で使う。
 * locale が変わると zustand が再レンダリングを起こすので、
 * 画面全体が自動的に切り替わる。
 */
export function useI18n() {
  const locale = useI18nStore((s) => s.locale)
  const setLocale = useI18nStore((s) => s.setLocale)

  return {
    locale,
    setLocale,
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    /** API が返す LocalizedText を現在の言語で表示する */
    tx: (text: LocalizedText | undefined) => {
      if (!text) return ''
      return text[locale] || text[DEFAULT_LOCALE] || ''
    },
  }
}

/** React の外（サービス層など）から使うための非フック版 */
export function getLocale(): Locale {
  return useI18nStore.getState().locale
}
