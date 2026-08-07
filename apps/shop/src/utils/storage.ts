import Taro from '@tarojs/taro'
import type { CartItem, Locale, UserProfile } from '@/types'

/**
 * ローカルストレージの型付きラッパー。
 * キーと値の対応をここに集約し、アプリ側で生の文字列キーを使わせない。
 */
export interface StorageSchema {
  locale: Locale
  token: string
  userProfile: UserProfile
  cart: CartItem[]
  /** 検索履歴（最大 10 件） */
  searchHistory: string[]
}

type StorageKey = keyof StorageSchema

const PREFIX = 'hfs:' // health-food-shop

function fullKey(key: StorageKey): string {
  return `${PREFIX}${key}`
}

export function getStorage<K extends StorageKey>(key: K): StorageSchema[K] | null {
  try {
    const value = Taro.getStorageSync(fullKey(key))
    // 空文字は「未設定」として扱う（Taro は未設定時に '' を返す）
    if (value === '' || value === undefined || value === null) return null
    return value as StorageSchema[K]
  } catch {
    return null
  }
}

export function setStorage<K extends StorageKey>(key: K, value: StorageSchema[K]): void {
  try {
    Taro.setStorageSync(fullKey(key), value)
  } catch (err) {
    // 容量超過（小程序は 10MB 上限）でも致命傷にはしない
    console.warn('[storage] write failed', key, err)
  }
}

export function removeStorage(key: StorageKey): void {
  try {
    Taro.removeStorageSync(fullKey(key))
  } catch {
    /* noop */
  }
}

/** ログアウト時に、ユーザー個別データのみを消す（言語設定などは残す） */
export function clearUserStorage(): void {
  removeStorage('token')
  removeStorage('userProfile')
  removeStorage('cart')
}

// ------------------------------------------------------------
// 有効期限付きキャッシュ（API レスポンスキャッシュ用）
// ------------------------------------------------------------

interface CacheEnvelope<T> {
  value: T
  expiresAt: number
}

export function getCache<T>(key: string): T | null {
  try {
    const raw = Taro.getStorageSync(`${PREFIX}cache:${key}`) as CacheEnvelope<T> | ''
    if (!raw || typeof raw !== 'object') return null
    if (Date.now() > raw.expiresAt) {
      Taro.removeStorageSync(`${PREFIX}cache:${key}`)
      return null
    }
    return raw.value
  } catch {
    return null
  }
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  try {
    const envelope: CacheEnvelope<T> = { value, expiresAt: Date.now() + ttlMs }
    Taro.setStorageSync(`${PREFIX}cache:${key}`, envelope)
  } catch (err) {
    console.warn('[storage] cache write failed', key, err)
  }
}

export function clearCache(): void {
  try {
    const { keys } = Taro.getStorageInfoSync()
    keys
      .filter((k) => k.startsWith(`${PREFIX}cache:`))
      .forEach((k) => Taro.removeStorageSync(k))
  } catch {
    /* noop */
  }
}
