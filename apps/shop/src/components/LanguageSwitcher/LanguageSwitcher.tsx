import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Locale } from '@/types'
import { useI18n } from '@/services/i18n'
import { SUPPORTED_LOCALES, resources } from '@/locales'
import { clearCache } from '@/utils/storage'

import './LanguageSwitcher.scss'

interface Props {
  /**
   * segmented: 中文 / 日本語 / English を並べたトグル（設定画面向け）
   * compact:   現在の言語を 1 つ表示し、タップで次の言語へ送る（ヘッダー向け）
   */
  variant?: 'segmented' | 'compact'
  /** compact のときに白抜きにする（メインカラー背景のヘッダー用） */
  inverse?: boolean
}

/**
 * ラベルは常にその言語自身の表記で出す。
 * 英語話者に「英語」と中国語で見せても選べないため。
 */
const LOCALE_LABEL: Record<Locale, string> = {
  'zh-CN': '中文',
  'ja-JP': '日本語',
  'en-US': 'EN',
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
      // 切り替え後の言語で知らせる（切り替わったことがその場で伝わる）
      title: resources[next].language.switched,
      icon: 'none',
      duration: 1500,
    })
  }

  if (variant === 'segmented') {
    return (
      <View className='lang-switcher lang-switcher--segmented'>
        {SUPPORTED_LOCALES.map((item) => (
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

  // 3 言語なのでトグルではなく循環。中文 → 日本語 → EN → 中文。
  const next: Locale =
    SUPPORTED_LOCALES[(SUPPORTED_LOCALES.indexOf(locale) + 1) % SUPPORTED_LOCALES.length]

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
