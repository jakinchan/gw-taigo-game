import { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from '@tarojs/components'
import Taro, { usePullDownRefresh, useShareAppMessage } from '@tarojs/taro'
import type { Category, Product } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import BrandHeader from '@/components/BrandHeader'
import Banner, { type BannerItem } from '@/components/Banner'
import QuickEntries from '@/components/QuickEntries'
import SideDock from '@/components/SideDock'
import ChipTabs, { type Chip } from '@/components/ChipTabs'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './index.scss'

/** 「畅销单品」は特定カテゴリではなく売れ筋の横断表示なので、専用 ID を持たせる */
const BESTSELLER = 'bestseller'

/**
 * 首页。
 *
 * 構成（实机準拠）:
 *   ブランドヘッダー + 検索
 *   → バナー（多数スライド）
 *   → クイック導線 5 つ
 *   → カテゴリチップ（横スクロール）
 *   → 商品 3 カラムグリッド
 *   → 右端フローティングボタン
 */
export default function Index() {
  const { t, tx } = useI18n()
  const headerHeight = useHeaderHeight({ withSearch: true })

  const [banners, setBanners] = useState<BannerItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeChip, setActiveChip] = useState<string>(BESTSELLER)

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const loadFeed = useCallback(async () => {
    setFailed(false)
    try {
      const feed = await productApi.homeFeed()
      setBanners(
        feed.banners.map((b, i) => ({
          ...b,
          caption: i < 3 ? t(`home.banner${i + 1}` as 'home.banner1') : undefined,
        })),
      )
      setCategories(feed.categories)
      setProducts(feed.recommended)
    } catch (err) {
      console.error('[index] feed failed', err)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadFeed()
  }, [loadFeed])

  // チップ切り替えで商品だけ差し替える
  const loadProducts = useCallback(async (chipId: string) => {
    setLoading(true)
    try {
      const result = await productApi.list({
        categoryId: chipId === BESTSELLER ? undefined : chipId,
        sort: 'sales',
        pageSize: 30,
      })
      setProducts(result.list)
    } catch (err) {
      console.error('[index] products failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeChip === BESTSELLER) return
    void loadProducts(activeChip)
  }, [activeChip, loadProducts])

  const chips = useMemo<Chip[]>(
    () => [
      { id: BESTSELLER, label: t('home.recommendTitle') },
      ...categories.map((category) => ({ id: category.id, label: tx(category.name) })),
    ],
    [categories, t, tx],
  )

  usePullDownRefresh(async () => {
    setActiveChip(BESTSELLER)
    await loadFeed()
    Taro.stopPullDownRefresh()
  })

  useShareAppMessage(() => ({ title: t('common.appName'), path: '/pages/index/index' }))

  return (
    <View className='home'>
      <BrandHeader showSearch />
      {/* fixed なヘッダーの分だけ場所を空ける */}
      <View style={{ height: `${headerHeight}px` }} />

      <View className='home__banner'>
        <Banner items={banners} height={168} interval={4500} />
      </View>

      <QuickEntries />

      <ChipTabs chips={chips} activeId={activeChip} onChange={setActiveChip} />

      {loading ? (
        <Loading loading variant='inline' />
      ) : failed ? (
        <Empty
          text={t('common.networkError')}
          icon='📡'
          actionText={t('common.retry')}
          onAction={() => {
            setLoading(true)
            void loadFeed()
          }}
        />
      ) : products.length === 0 ? (
        <Empty text={t('category.emptyProducts')} />
      ) : (
        <View className='home__grid'>
          {products.map((product) => (
            <View key={product.id} className='home__grid-cell'>
              <ProductCard product={product} variant='grid3' />
            </View>
          ))}
        </View>
      )}

      {/* 健康食品の広告規制に対応する固定表記 */}
      <View className='home__disclaimer'>{t('product.healthDisclaimer')}</View>

      <SideDock />
    </View>
  )
}
