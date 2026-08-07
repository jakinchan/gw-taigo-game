import { useCallback, useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import type { Product } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { formatCny } from '@/utils/currency'
import SafeImage from '@/components/SafeImage'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'
import logo from '@/assets/logo.png'

import './newarrival.scss'

/**
 * 人气新品。
 *
 * 実機では商品の販促画像（縦長のバナー）を 2 カラムで並べ、
 * 各カードの下に「券后价 ¥290」と青い「立即购买」ボタンを置く。
 * カード上部にはブランド行と「跨境」バッジが入る。
 */
export default function NewArrival() {
  const { t, tx } = useI18n()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await productApi.list({ sort: 'newest', pageSize: 30 })
      setProducts(result.list)
    } catch (err) {
      console.error('[newarrival] load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const buy = (product: Product) => {
    Taro.setStorageSync('hfs:buyNow', [{ productId: product.id, quantity: 1 }])
    Taro.navigateTo({ url: '/pages/checkout/checkout?mode=buyNow' })
  }

  if (loading) return <Loading loading variant='page' />
  if (products.length === 0) return <Empty text={t('category.emptyProducts')} />

  return (
    <View className='newarrival'>
      <View className='newarrival__grid'>
        {products.map((product) => (
          <View key={product.id} className='newarrival__cell'>
            <View className='newarrival__card'>
              <View
                className='newarrival__head'
                onClick={() => Taro.navigateTo({ url: `/pages/product/detail?id=${product.id}` })}
              >
                <SafeImage className='newarrival__logo' src={logo} mode='aspectFit' />
                <Text className='newarrival__brand'>{t('common.appName')}</Text>
                {product.isCrossBorder && (
                  <Text className='newarrival__badge'>{t('product.crossBorder')}</Text>
                )}
              </View>

              <SafeImage
                className='newarrival__image'
                src={product.thumbnail} options={{ width: 170, height: 210 }}
                mode='aspectFill'
                lazyLoad
                onClick={() => Taro.navigateTo({ url: `/pages/product/detail?id=${product.id}` })}
              />

              <Text className='newarrival__name'>{tx(product.name)}</Text>

              <View className='newarrival__footer'>
                <View className='newarrival__price-col'>
                  <Text className='newarrival__price-label'>{t('newarrival.couponPrice')}</Text>
                  <Text className='newarrival__price'>¥{formatCny(product.priceCny)}</Text>
                </View>

                <View
                  className='newarrival__buy'
                  hoverClass='newarrival__buy--hover'
                  onClick={() => buy(product)}
                >
                  <Text>{t('product.buyNow')}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
