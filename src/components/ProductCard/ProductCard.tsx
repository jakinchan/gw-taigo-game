import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Product } from '@/types'
import { useI18n } from '@/services/i18n'
import { usePreferenceStore } from '@/store/preference'
import { cnyToJpy, formatJpy, splitCny } from '@/utils/currency'
import { imageUrl } from '@/utils/image'

import './ProductCard.scss'

interface Props {
  product: Product
  /**
   * grid3: 首页の 3 カラム（最も情報密度が高い）
   * grid2: 全部商品の 2 カラム
   * compact: 横スクロール用
   */
  variant?: 'grid3' | 'grid2' | 'compact'
  onClick?: (product: Product) => void
}

const UNIT_LABEL: Record<NonNullable<Product['priceUnit']>, string> = {
  month: '/月',
  piece: '/个',
  box: '/盒',
  day: '/日',
}

/**
 * 商品カード。
 *
 * 营养工厂の意匠に合わせている:
 *   - 右上に 45 度の斜めリボン（「本品TOP1」など）
 *   - 「折后」+ 大きな価格 + 単位（/月）
 *   - 「市面同品质 ¥300~¥500」の参考価格（取り消し線）
 *   - 商品サムネイルは価格の右側に小さく置く
 *   - カード下端に淡い青のタグバー（「现货·限时 85 折」など）
 */
export default function ProductCard({ product, variant = 'grid3', onClick }: Props) {
  const { t, tx } = useI18n()
  const showJpy = usePreferenceStore((s) => s.showJpy)

  const soldOut = product.stock <= 0 && product.stockLabel !== 'producing'
  const { integer, decimal } = splitCny(product.priceCny)
  const unit = UNIT_LABEL[product.priceUnit ?? 'piece']

  const goDetail = () => {
    if (onClick) {
      onClick(product)
      return
    }
    Taro.navigateTo({ url: `/pages/product/detail?id=${product.id}` })
  }

  const stockText =
    product.stockLabel === 'producing'
      ? t('product.producing')
      : product.stockLabel === 'preorder'
        ? t('product.preorder')
        : t('product.inStock')

  return (
    <View
      className={`pcard pcard--${variant} ${soldOut ? 'is-sold-out' : ''}`}
      hoverClass='pcard--hover'
      hoverStayTime={80}
      onClick={goDetail}
    >
      {/* 右上の斜めリボン */}
      {product.ribbon && (
        <View className={`pcard__ribbon pcard__ribbon--${product.ribbonTone ?? 'primary'}`}>
          <Text>{tx(product.ribbon)}</Text>
        </View>
      )}

      <View className='pcard__body'>
        <Text className='pcard__name'>{tx(product.name)}</Text>

        {product.specLabel && (
          <View className='pcard__spec'>
            <Text>{tx(product.specLabel)}</Text>
          </View>
        )}

        <View className='pcard__bottom'>
          <View className='pcard__price-col'>
            {product.hasDiscount && <Text className='pcard__discount-label'>{t('product.afterDiscount')}</Text>}

            <View className='pcard__price'>
              <Text className='pcard__price-symbol'>¥</Text>
              <Text className='pcard__price-int'>{integer}</Text>
              {decimal !== '00' && <Text className='pcard__price-dec'>.{decimal}</Text>}
              <Text className='pcard__price-unit'>{unit}</Text>
            </View>

            {showJpy && (
              <Text className='pcard__jpy'>
                {t('common.approx')} ￥{formatJpy(cnyToJpy(product.priceCny))}
              </Text>
            )}

            {product.marketPriceRange && (
              <>
                <Text className='pcard__market-label'>{t('product.marketPrice')}</Text>
                <Text className='pcard__market-value'>{product.marketPriceRange}</Text>
              </>
            )}
          </View>

          <Image
            className='pcard__thumb'
            src={imageUrl(product.thumbnail, { width: 56, height: 72 })}
            mode='aspectFit'
            lazyLoad
          />
        </View>
      </View>

      {/* 下端のタグバー */}
      {(product.footerTag || product.stockLabel) && (
        <View
          className={`pcard__footer ${
            product.stockLabel === 'producing' ? 'pcard__footer--muted' : ''
          }`}
        >
          <Text>{product.footerTag ? tx(product.footerTag) : stockText}</Text>
        </View>
      )}

      {soldOut && (
        <View className='pcard__soldout'>
          <Text>{t('product.stockOut')}</Text>
        </View>
      )}
    </View>
  )
}
