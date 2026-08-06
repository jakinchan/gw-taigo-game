import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useDidShow, useShareAppMessage } from '@tarojs/taro'
import type { Category, Product } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useCartStore, selectTotalCount } from '@/store/cart'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import Header from '@/components/Header'
import Banner, { type BannerItem } from '@/components/Banner'
import CategoryGrid from '@/components/CategoryGrid'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './index.scss'

interface HomeData {
  banners: BannerItem[]
  categories: Category[]
  recommended: Product[]
  newArrivals: Product[]
  onSale: Product[]
}

/**
 * 首页（トップページ）。
 *
 * 構成: カスタムヘッダー → バナー → カテゴリ導線 → おすすめ → 新着 → セール
 * データは /home-feed で 1 往復にまとめている。初期表示のリクエスト数を
 * 減らすほど、小程序の体感速度は素直に良くなる。
 */
export default function Index() {
  const { t } = useI18n()
  const headerHeight = useHeaderHeight({ withSearch: true })
  const cartCount = useCartStore(selectTotalCount)

  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const feed = await productApi.homeFeed()
      setData({
        banners: feed.banners.map((b, i) => ({
          ...b,
          caption: t(`home.banner${Math.min(i + 1, 3)}` as 'home.banner1'),
        })),
        categories: feed.categories,
        recommended: feed.recommended,
        newArrivals: feed.newArrivals,
        onSale: feed.onSale,
      })
    } catch (err) {
      console.error('[index] load failed', err)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  // 他ページからカートに追加された分をバッジへ反映する
  useDidShow(() => {
    if (cartCount > 0) {
      Taro.setTabBarBadge({ index: 2, text: cartCount > 99 ? '99+' : String(cartCount) }).catch(
        () => {},
      )
    }
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  useShareAppMessage(() => ({
    title: t('common.appName'),
    path: '/pages/index/index',
  }))

  if (loading) {
    return (
      <View className='home'>
        <Header showSearch />
        <View style={{ height: `${headerHeight}px` }} />
        <Loading loading variant='inline' />
      </View>
    )
  }

  if (failed || !data) {
    return (
      <View className='home'>
        <Header showSearch />
        <View style={{ height: `${headerHeight}px` }} />
        <Empty
          text={t('common.networkError')}
          icon='📡'
          actionText={t('common.retry')}
          onAction={() => {
            setLoading(true)
            void load()
          }}
        />
      </View>
    )
  }

  return (
    <View className='home'>
      <Header showSearch />
      {/* fixed なヘッダーの分だけ場所を空ける */}
      <View style={{ height: `${headerHeight}px` }} />

      <View className='home__banner'>
        <Banner items={data.banners} height={160} />
      </View>

      <View className='u-section-title'>
        <Text className='u-section-title__text'>{t('home.categoryTitle')}</Text>
      </View>
      <CategoryGrid categories={data.categories} columns={4} limit={8} />

      {/* ---- おすすめ（2 カラムグリッド） ---- */}
      <View className='u-section-title'>
        <Text className='u-section-title__text'>{t('home.recommendTitle')}</Text>
        <Text className='u-section-title__sub'>{t('home.recommendSub')}</Text>
      </View>
      <View className='home__grid'>
        {data.recommended.map((product) => (
          <View key={product.id} className='home__grid-cell'>
            <ProductCard product={product} variant='grid' />
          </View>
        ))}
      </View>

      {/* ---- 新着（横スクロール） ---- */}
      {data.newArrivals.length > 0 && (
        <>
          <View className='u-section-title'>
            <Text className='u-section-title__text'>{t('home.newTitle')}</Text>
            <Text
              className='u-section-title__sub'
              onClick={() => Taro.switchTab({ url: '/pages/category/category' })}
            >
              {t('home.viewAll')} ›
            </Text>
          </View>
          <ScrollView className='home__scroller' scrollX enableFlex showScrollbar={false}>
            <View className='home__scroller-inner'>
              {data.newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} variant='compact' />
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {/* ---- セール ---- */}
      {data.onSale.length > 0 && (
        <>
          <View className='u-section-title'>
            <Text className='u-section-title__text'>{t('home.saleTitle')}</Text>
          </View>
          <View className='home__sale'>
            {data.onSale.map((product) => (
              <View key={product.id} className='home__sale-item'>
                <ProductCard product={product} variant='list' showAddButton={false} />
              </View>
            ))}
          </View>
        </>
      )}

      {/* 健康食品の広告規制に対応する固定表記 */}
      <View className='home__disclaimer'>
        <Text>{t('product.healthDisclaimer')}</Text>
      </View>

      <View className='home__bottom-space' />
    </View>
  )
}
