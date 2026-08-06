import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Category } from '@/types'
import { useI18n } from '@/services/i18n'
import { imageUrl, IMAGE_PRESET } from '@/utils/image'

import './CategoryGrid.scss'

interface Props {
  categories: Category[]
  /** 1 行あたりの表示数。仕様の「4〜6 個」に合わせて既定 4。 */
  columns?: 4 | 5
  /** 表示する最大件数 */
  limit?: number
}

/**
 * トップページのカテゴリ導線（アイコン + 名称）。
 * カテゴリページは tabBar ページなので switchTab で遷移し、
 * 選択カテゴリはグローバルなクエリではなくストレージ経由で渡す
 * （switchTab は URL パラメータを受け取れないため）。
 */
export default function CategoryGrid({ categories, columns = 4, limit = 8 }: Props) {
  const { tx } = useI18n()

  const goCategory = (category: Category) => {
    Taro.setStorageSync('hfs:pendingCategoryId', category.id)
    Taro.switchTab({ url: '/pages/category/category' })
  }

  return (
    <View className={`category-grid category-grid--col${columns}`}>
      {categories.slice(0, limit).map((category) => (
        <View
          key={category.id}
          className='category-grid__item'
          hoverClass='category-grid__item--hover'
          onClick={() => goCategory(category)}
        >
          <View className='category-grid__icon-wrap'>
            <Image
              className='category-grid__icon'
              src={imageUrl(category.icon, IMAGE_PRESET.categoryIcon)}
              mode='aspectFit'
              lazyLoad
            />
          </View>
          <Text className='category-grid__name'>{tx(category.name)}</Text>
        </View>
      ))}
    </View>
  )
}
