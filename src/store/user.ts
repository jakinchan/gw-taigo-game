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
  signOut: () => void
}

export const useUserStore = create<UserState>((set) => ({
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

  signOut: () => {
    clearUserStorage()
    set({ profile: null, isLoggedIn: false })
  },
}))
