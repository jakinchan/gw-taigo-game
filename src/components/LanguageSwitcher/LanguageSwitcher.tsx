import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Locale } from '@/types'
import { useI18n } from '@/services/i18n'
import { clearCache } from '@/utils/storage'

import './LanguageSwitcher.scss'

interface Props {
  /**
   * segmented: 中文 / 日本語 を並べたトグル（設定画面向け）
   * compact:   現在の言語を 1 つ表示し、タップで切り替え（ヘッダー向け）
   */
  variant?: 'segmented' | 'compact'
  /** compact のときに白抜きにする（メインカラー背景のヘッダー用） */
  inverse?: boolean
}

const LOCALE_LABEL: Record<Locale, string> = {
  'zh-CN': '中文',
  'ja-JP': '日本語',
}

/**
 * 言語切り替え。
 * 切り替え時に API キャッシュを破棄する理由: レスポンスに含まれる
 * LocalizedText はクライアントで選択するのでキャッシュ自体は言語非依存だが、
 * サーバがロケール別に整形して返すエンドポイント（バナー等）が混ざるため、
 * 一貫性を優先して捨てている。
 */
export default function LanguageSwitcher({ variant = 'compact', inverse = false }: Props) {
  const { locale, setLocale, t } = useI18n()

  const switchTo = (next: Locale) => {
    if (next === locale) return
    setLocale(next)
    clearCache()
    Taro.showToast({
      title: next === 'zh-CN' ? '已切换为中文' : '日本語に切り替えました',
      icon: 'none',
      duration: 1500,
    })
  }

  if (variant === 'segmented') {
    return (
      <View className='lang-switcher lang-switcher--segmented'>
        {(Object.keys(LOCALE_LABEL) as Locale[]).map((item) => (
          <View
            key={item}
            className={`lang-switcher__segment ${item === locale ? 'is-active' : ''}`}
            hoverClass='lang-switcher__segment--hover'
            onClick={() => switchTo(item)}
          >
            <Text>{LOCALE_LABEL[item]}</Text>
          </View>
        ))}
      </View>
    )
  }

  const next: Locale = locale === 'zh-CN' ? 'ja-JP' : 'zh-CN'

  return (
    <View
      className={`lang-switcher lang-switcher--compact ${inverse ? 'is-inverse' : ''}`}
      hoverClass='lang-switcher--hover'
      onClick={() => switchTo(next)}
      // 読み上げのため、何をするボタンかを明示する
      aria-label={t('language.switch')}
      aria-role='button'
    >
      <Text className='lang-switcher__globe'>🌐</Text>
      <Text className='lang-switcher__label'>{LOCALE_LABEL[locale]}</Text>
    </View>
  )
}
