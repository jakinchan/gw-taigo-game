import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Product } from '@/types'
import { useI18n } from '@/services/i18n'
import { useCartStore } from '@/store/cart'
import { imageUrl, IMAGE_PRESET } from '@/utils/image'
import PriceTag from '@/components/PriceTag'

import './ProductCard.scss'

interface Props {
  product: Product
  /**
   * grid: 2 カラム用の縦積みカード
   * list: 横長カード（カテゴリページのリスト表示）
   * compact: 横スクロール用の小さめカード
   */
  variant?: 'grid' | 'list' | 'compact'
  /** カート追加ボタンを出すか */
  showAddButton?: boolean
  onClick?: (product: Product) => void
}

/**
 * 商品カード。一覧系ページ全部でこれを使う。
 * タップ領域はカード全体。カート追加ボタンだけイベント伝播を止める。
 */
export default function ProductCard({
  product,
  variant = 'grid',
  showAddButton = true,
  onClick,
}: Props) {
  const { t, tx } = useI18n()
  const addToCart = useCartStore((s) => s.add)

  const soldOut = product.stock <= 0

  const goDetail = () => {
    if (onClick) {
      onClick(product)
      return
    }
    Taro.navigateTo({ url: `/pages/product/detail?id=${product.id}` })
  }

  const handleAdd = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (soldOut) {
      Taro.showToast({ title: t('product.stockOut'), icon: 'none' })
      return
    }
    addToCart(product, 1)
    Taro.vibrateShort({ type: 'light' }).catch(() => {})
    Taro.showToast({ title: t('product.addedToCart'), icon: 'none', duration: 1200 })
  }

  const thumbSize =
    variant === 'list' ? { width: 110, height: 110 } : IMAGE_PRESET.productThumb

  return (
    <View
      className={`product-card product-card--${variant} ${soldOut ? 'is-sold-out' : ''}`}
      hoverClass='product-card--hover'
      hoverStayTime={80}
      onClick={goDetail}
    >
      <View className='product-card__media'>
        <Image
          className='product-card__image'
          src={imageUrl(product.thumbnail, thumbSize)}
          mode='aspectFill'
          lazyLoad
        />

        {product.isNew && <Text className='product-card__badge'>NEW</Text>}
        {product.isOnSale && !product.isNew && (
          <Text className='product-card__badge product-card__badge--sale'>SALE</Text>
        )}
        {soldOut && (
          <View className='product-card__soldout'>
            <Text>{t('product.stockOut')}</Text>
          </View>
        )}
      </View>

      <View className='product-card__body'>
        <Text className='product-card__name'>{tx(product.name)}</Text>
        {variant !== 'compact' && (
          <Text className='product-card__subtitle'>{tx(product.subtitle)}</Text>
        )}

        {product.tags.length > 0 && variant !== 'compact' && (
          <View className='product-card__tags'>
            {product.tags.slice(0, 2).map((tag, i) => (
              <Text key={i} className='product-card__tag'>
                {tx(tag)}
              </Text>
            ))}
          </View>
        )}

        <View className='product-card__footer'>
          <PriceTag
            priceCny={product.priceCny}
            originalPriceCny={product.originalPriceCny}
            size={variant === 'compact' ? 'sm' : 'md'}
            jpyPosition='below'
          />

          {showAddButton ? (
            <View
              className='product-card__add'
              hoverClass='product-card__add--hover'
              onClick={handleAdd}
              aria-role='button'
              aria-label={t('product.addToCart')}
            >
              <Text className='product-card__add-icon'>＋</Text>
            </View>
          ) : (
            <Text className='product-card__sales'>
              {t('product.sales')} {product.salesCount}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}
