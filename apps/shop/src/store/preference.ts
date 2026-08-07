import { create } from 'zustand'
import { getStorage, setStorage } from '@/utils/storage'

/**
 * 表示設定。言語は i18n ストアが持つので、ここでは通貨表示など UI の好みを扱う。
 */
interface PreferenceState {
  /** 価格に日本円の参考換算を併記するか */
  showJpy: boolean
  setShowJpy: (value: boolean) => void
  toggleShowJpy: () => void
}

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  showJpy: getStorage('showJpy') ?? false,

  setShowJpy: (value) => {
    setStorage('showJpy', value)
    set({ showJpy: value })
  },

  toggleShowJpy: () => {
    const next = !get().showJpy
    setStorage('showJpy', next)
    set({ showJpy: next })
  },
}))
