import { useMemo } from 'react'
import { View, Text, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import logo from '@/assets/logo.png'

import './Header.scss'

interface Props {
  /** 検索バーを表示するか */
  showSearch?: boolean
  /** 検索バーを入力可能にするか。false ならタップで検索ページへ遷移する体裁。 */
  searchEditable?: boolean
  searchValue?: string
  onSearchInput?: (value: string) => void
  onSearchConfirm?: (value: string) => void
  /** 戻るボタン（navigationStyle: custom のページで使う） */
  showBack?: boolean
  /** ロゴの代わりにテキストタイトルを出す */
  title?: string
  showLanguage?: boolean
}

/**
 * カスタムヘッダー。
 *
 * navigationStyle: 'custom' のページで使う前提。
 * ステータスバー高さと「カプセルボタン（右上の … ●）」の実測値から
 * 安全な余白を計算する。カプセルの位置は端末と微信バージョンで変わるため、
 * 固定値でハードコードしてはいけない。
 */
export default function Header({
  showSearch = true,
  searchEditable = false,
  searchValue = '',
  onSearchInput,
  onSearchConfirm,
  showBack = false,
  title,
  showLanguage = true,
}: Props) {
  const { t } = useI18n()

  const metrics = useMemo(() => {
    // H5 では getMenuButtonBoundingClientRect が無いのでフォールバックする
    let statusBarHeight = 20
    let screenWidth = 375
    try {
      const info = Taro.getSystemInfoSync()
      statusBarHeight = info.statusBarHeight ?? 20
      screenWidth = info.screenWidth ?? 375
    } catch {
      /* fallthrough */
    }

    let capsule = { top: statusBarHeight + 4, height: 32, left: screenWidth - 94, width: 87 }
    try {
      const rect = Taro.getMenuButtonBoundingClientRect?.()
      if (rect && rect.height > 0) capsule = rect
    } catch {
      /* fallthrough */
    }

    const navRowHeight = capsule.height + (capsule.top - statusBarHeight) * 2
    // カプセルに重ならないよう、右側に「画面幅 - カプセル左端 + 余白」を空ける
    const rightSafe = screenWidth - capsule.left + 8

    return { statusBarHeight, navRowHeight, rightSafe }
  }, [])

  const goSearch = () => {
    if (searchEditable) return
    Taro.navigateTo({ url: '/pages/category/category?focusSearch=1' })
  }

  return (
    <View
      className='app-header'
      style={{ paddingTop: `${metrics.statusBarHeight}px` }}
    >
      <View
        className='app-header__nav'
        style={{ height: `${metrics.navRowHeight}px`, paddingRight: `${metrics.rightSafe}px` }}
      >
        {showBack && (
          <View
            className='app-header__back'
            hoverClass='app-header__back--hover'
            onClick={() => Taro.navigateBack()}
            aria-role='button'
            aria-label={t('common.back')}
          >
            <Text className='app-header__back-icon'>‹</Text>
          </View>
        )}

        {title ? (
          <Text className='app-header__title'>{title}</Text>
        ) : (
          <View className='app-header__brand'>
            <Image className='app-header__logo' src={logo} mode='aspectFit' />
            <Text className='app-header__brand-name'>{t('common.appName')}</Text>
          </View>
        )}

        <View className='app-header__spacer' />

        {showLanguage && <LanguageSwitcher variant='compact' />}
      </View>

      {showSearch && (
        <View className='app-header__search-row'>
          <View className='app-header__search' onClick={goSearch}>
            <Text className='app-header__search-icon'>🔍</Text>
            {searchEditable ? (
              <Input
                className='app-header__search-input'
                value={searchValue}
                placeholder={t('common.search')}
                placeholderClass='app-header__search-placeholder'
                confirmType='search'
                onInput={(e) => onSearchInput?.(e.detail.value)}
                onConfirm={(e) => onSearchConfirm?.(e.detail.value)}
              />
            ) : (
              <Text className='app-header__search-placeholder'>{t('common.search')}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
