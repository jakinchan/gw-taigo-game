import { useMemo } from 'react'
import { View, Text, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import logo from '@/assets/logo.png'

import './BrandHeader.scss'

interface Props {
  /** 検索バーを出すか */
  showSearch?: boolean
  /** 検索バーを入力可能にする（検索ページ用） */
  searchEditable?: boolean
  searchValue?: string
  onSearchInput?: (value: string) => void
  onSearchConfirm?: (value: string) => void
}

/**
 * ブランドヘッダー。
 *
 * 实机では「🌿 UndoAge 营养工厂®」を中央に置き、その下に検索バーを敷く。
 * カプセルボタン（右上の … ●）と重ならないよう、ブランド行の高さは
 * カプセルの実測値から決める。ロゴを中央寄せにしているので左右の
 * 余白は対称に取る必要があり、言語切替は検索行の右端に逃がしている。
 */
export default function BrandHeader({
  showSearch = true,
  searchEditable = false,
  searchValue = '',
  onSearchInput,
  onSearchConfirm,
}: Props) {
  const { t } = useI18n()

  const metrics = useMemo(() => {
    let statusBarHeight = 20
    try {
      statusBarHeight = Taro.getSystemInfoSync().statusBarHeight ?? 20
    } catch {
      /* fallthrough */
    }

    let capsuleHeight = 32
    let capsuleTop = statusBarHeight + 4
    try {
      const rect = Taro.getMenuButtonBoundingClientRect?.()
      if (rect && rect.height > 0) {
        capsuleHeight = rect.height
        capsuleTop = rect.top
      }
    } catch {
      /* fallthrough */
    }

    return {
      statusBarHeight,
      brandRowHeight: capsuleHeight + (capsuleTop - statusBarHeight) * 2,
    }
  }, [])

  const goSearch = () => {
    if (searchEditable) return
    Taro.navigateTo({ url: '/pages/search/search' })
  }

  return (
    <View className='brand-header' style={{ paddingTop: `${metrics.statusBarHeight}px` }}>
      <View className='brand-header__row' style={{ height: `${metrics.brandRowHeight}px` }}>
        <Image className='brand-header__logo' src={logo} mode='aspectFit' />
        <Text className='brand-header__name'>{t('common.appName')}</Text>
        <Text className='brand-header__reg'>®</Text>
      </View>

      {showSearch && (
        <View className='brand-header__search-row'>
          <View className='brand-header__search' onClick={goSearch}>
            <Text className='brand-header__search-icon'>🔍</Text>
            {searchEditable ? (
              <Input
                className='brand-header__search-input'
                value={searchValue}
                placeholder={t('search.placeholder')}
                placeholderClass='brand-header__search-placeholder'
                confirmType='search'
                onInput={(e) => onSearchInput?.(e.detail.value)}
                onConfirm={(e) => onSearchConfirm?.(e.detail.value)}
              />
            ) : (
              <Text className='brand-header__search-placeholder' />
            )}

            <View
              className='brand-header__search-btn'
              hoverClass='brand-header__search-btn--hover'
              onClick={(e) => {
                e.stopPropagation()
                if (searchEditable) onSearchConfirm?.(searchValue)
                else goSearch()
              }}
            >
              <Text>{t('common.search')}</Text>
            </View>
          </View>

          <LanguageSwitcher variant='compact' />
        </View>
      )}
    </View>
  )
}
