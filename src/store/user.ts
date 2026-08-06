import { create } from 'zustand'
import type { UserProfile } from '@/types'
import { userApi } from '@/services/api'
import { clearUserStorage, getStorage, setStorage } from '@/utils/storage'
import { login } from '@/utils/request'

interface UserState {
  profile: UserProfile | null
  loading: boolean
  isLoggedIn: boolean
  /** 微信ログイン → プロフィール取得 */
  signIn: () => Promise<UserProfile | null>
  /** 起動時にキャッシュ済みトークンがあれば静かに復元する */
  restore: () => Promise<void>
  /**
   * 積分だけを更新する。抽選など、積分の増減がサーバ側で確定した直後に
   * プロフィール全体を取り直さずに表示へ反映させるために使う。
   */
  setPoints: (points: number) => void
  signOut: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: getStorage('userProfile'),
  loading: false,
  isLoggedIn: Boolean(getStorage('token')),

  signIn: async () => {
    set({ loading: true })
    try {
      const token = await login()
      if (!token) {
        set({ loading: false })
        return null
      }
      const profile = await userApi.profile()
      setStorage('userProfile', profile)
      set({ profile, isLoggedIn: true, loading: false })
      return profile
    } catch (err) {
      console.error('[user] signIn failed', err)
      set({ loading: false })
      return null
    }
  },

  restore: async () => {
    if (!getStorage('token')) return
    try {
      const profile = await userApi.profile()
      setStorage('userProfile', profile)
      set({ profile, isLoggedIn: true })
    } catch {
      // トークン失効。次の認証必須リクエストで自動再ログインされる。
      set({ isLoggedIn: false })
    }
  },

  setPoints: (points) => {
    const current = get().profile
    if (!current) return
    const next = { ...current, points }
    setStorage('userProfile', next)
    set({ profile: next })
  },

  signOut: () => {
    clearUserStorage()
    set({ profile: null, isLoggedIn: false })
  },
}))
