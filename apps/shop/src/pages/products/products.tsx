import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { Category, Product } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { getScreenMetrics } from '@/utils/platform'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './products.scss'

/** 出荷区分。发货专区＝在庫あり、众筹专区＝生産中の共同購入。 */
type Zone = 'shipping' | 'crowdfunding'

const PAGE_SIZE = 20
const ALL = 'all'

/**
 * 全部商品（tabBar 2 番目）。
 *
 * 構成（实机準拠）:
 *   カスタムヘッダー（検索・ホーム・マイページのアイコン + タイトル）
 *   → 发货专区 / 众筹专区 のセグメント
 *   → 左サイドバー（カテゴリ）＋ 右 2 カラムグリッド
 */
export default function Products() {
  const { t, tx } = useI18n()

  const [zone, setZone] = useState<Zone>('shipping')
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string>(ALL)

  const [products, setProducts] = useState<Product[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const statusBarHeight = useMemo(() => getScreenMetrics().statusBarHeight, [])

  useEffect(() => {
    productApi
      .categories()
      .then(setCategories)
      .catch((err) => console.error('[products] categories failed', err))
  }, [])

  /**
   * 首页のクイック導線は switchTab で来るため URL パラメータを使えない。
   * 開くべきセグメントをストレージ経由で受け取り、読んだら消す。
   */
  useDidShow(() => {
    const pending = Taro.getStorageSync('hfs:pendingZone') as Zone | ''
    if (pending) {
      Taro.removeStorageSync('hfs:pendingZone')
      setZone(pending)
    }
  })

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const result = await productApi.list({
        categoryId: activeCategoryId === ALL ? undefined : activeCategoryId,
        sort: 'sales',
        page: targetPage,
        pageSize: PAGE_SIZE,
      })

      // 众筹专区は生産中の商品のみ、发货专区はそれ以外を出す
      const filtered = result.list.filter((product) =>
        zone === 'crowdfunding'
          ? product.stockLabel === 'producing'
          : product.stockLabel !== 'producing',
      )

      setHasMore(result.hasMore)
      setProducts((prev) => (targetPage === 1 ? filtered : [...prev, ...filtered]))
    },
    [activeCategoryId, zone],
  )

  useEffect(() => {
    setLoading(true)
    setPage(1)
    fetchPage(1)
      .catch((err) => console.error('[products] load failed', err))
      .finally(() => setLoading(false))
  }, [fetchPage])

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return
    setLoadingMore(true)
    const next = page + 1
    try {
      await fetchPage(next)
      setPage(next)
    } catch (err) {
      console.error('[products] load more failed', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const sidebarItems = useMemo(
    () => [{ id: ALL, label: t('products.all') }, ...categories.map((c) => ({ id: c.id, label: tx(c.name) }))],
    [categories, t, tx],
  )

  const activeLabel = sidebarItems.find((item) => item.id === activeCategoryId)?.label ?? ''

  return (
    <View className='products'>
      {/* ---- ヘッダー ---- */}
      <View className='products__header' style={{ paddingTop: `${statusBarHeight}px` }}>
        <View className='products__header-row'>
          <View className='products__icons'>
            <Text
              className='products__icon'
              onClick={() => Taro.navigateTo({ url: '/pages/search/search' })}
            >
              🔍
            </Text>
            <Text
              className='products__icon'
              onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
            >
              ⌂
            </Text>
            <Text
              className='products__icon'
              onClick={() => Taro.switchTab({ url: '/pages/user/user' })}
            >
              ⛉
            </Text>
          </View>
          <Text className='products__title'>{t('products.title')}</Text>
          {/* タイトルを中央に保つための右側スペーサー */}
          <View className='products__icons products__icons--ghost' />
        </View>

        {/* ---- 出荷区分セグメント ---- */}
        <View className='products__zones'>
          {(
            [
              ['shipping', t('products.zoneShipping')],
              ['crowdfunding', t('products.zoneCrowdfunding')],
            ] as [Zone, string][]
          ).map(([key, label]) => (
            <View
              key={key}
              className={`products__zone ${zone === key ? 'is-active' : ''}`}
              onClick={() => setZone(key)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---- 本体 ---- */}
      <View className='products__body'>
        <ScrollView className='products__sidebar' scrollY showScrollbar={false}>
          {sidebarItems.map((item) => (
            <View
              key={item.id}
              className={`products__side-item ${item.id === activeCategoryId ? 'is-active' : ''}`}
              onClick={() => setActiveCategoryId(item.id)}
            >
              <Text className='products__side-text'>{item.label}</Text>
            </View>
          ))}
        </ScrollView>

        <ScrollView
          className='products__list'
          scrollY
          showScrollbar={false}
          lowerThreshold={120}
          onScrollToLower={loadMore}
        >
          <Text className='products__section-title'>
            {zone === 'crowdfunding' ? t('products.crowdfundingSuccess') : activeLabel}
          </Text>

          {loading ? (
            <Loading loading variant='inline' />
          ) : products.length === 0 ? (
            <Empty text={t('category.emptyProducts')} />
          ) : (
            <>
              <View className='products__grid'>
                {products.map((product) => (
                  <View key={product.id} className='products__grid-cell'>
                    <ProductCard product={product} variant='grid2' />
                  </View>
                ))}
              </View>
              {loadingMore && <Loading loading variant='inline' />}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  )
}
