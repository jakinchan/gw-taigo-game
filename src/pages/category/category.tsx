import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { Category, Product, ProductSort } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import Header from '@/components/Header'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './category.scss'

const PAGE_SIZE = 20

/**
 * 分类（カテゴリ）ページ。
 *
 * 左サイドバーでカテゴリ、上部で並び替え、右側に 2 カラムグリッド。
 * 価格順だけは押すたびに 昇順 ⇄ 降順 をトグルする（中国 EC の慣習）。
 */
export default function CategoryPage() {
  const { t, tx } = useI18n()
  const router = useRouter()
  const headerHeight = useHeaderHeight({ withSearch: true })

  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string>('')
  const [sort, setSort] = useState<ProductSort>('default')
  const [keyword, setKeyword] = useState('')

  const [products, setProducts] = useState<Product[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // ---- カテゴリ一覧 ----
  useEffect(() => {
    productApi
      .categories()
      .then((list) => {
        setCategories(list)
        setActiveCategoryId((current) => current || list[0]?.id || '')
      })
      .catch((err) => console.error('[category] load categories failed', err))
  }, [])

  /**
   * トップページの CategoryGrid は switchTab で来るため URL パラメータを使えない。
   * ストレージ経由で選択カテゴリを受け取り、読んだら必ず消す。
   */
  useDidShow(() => {
    const pending = Taro.getStorageSync('hfs:pendingCategoryId') as string
    if (pending) {
      Taro.removeStorageSync('hfs:pendingCategoryId')
      setActiveCategoryId(pending)
    }
  })

  // ---- 商品一覧 ----
  const fetchProducts = useCallback(
    async (targetPage: number) => {
      const result = await productApi.list({
        categoryId: keyword ? undefined : activeCategoryId || undefined,
        keyword: keyword || undefined,
        sort,
        page: targetPage,
        pageSize: PAGE_SIZE,
      })
      setHasMore(result.hasMore)
      setProducts((prev) => (targetPage === 1 ? result.list : [...prev, ...result.list]))
    },
    [activeCategoryId, keyword, sort],
  )

  useEffect(() => {
    setLoading(true)
    setPage(1)
    fetchProducts(1)
      .catch((err) => console.error('[category] load products failed', err))
      .finally(() => setLoading(false))
  }, [fetchProducts])

  const loadMore = async () => {
    if (!hasMore || loadingMore || loading) return
    setLoadingMore(true)
    const next = page + 1
    try {
      await fetchProducts(next)
      setPage(next)
    } catch (err) {
      console.error('[category] load more failed', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleSort = (target: 'default' | 'sales' | 'price' | 'newest') => {
    if (target === 'price') {
      // 価格は押すたびに昇順 ⇄ 降順
      setSort((current) => (current === 'price_asc' ? 'price_desc' : 'price_asc'))
      return
    }
    setSort(target)
  }

  const sortTabs = useMemo(
    () =>
      [
        { key: 'default' as const, label: t('category.sortDefault'), active: sort === 'default' },
        { key: 'sales' as const, label: t('category.sortSales'), active: sort === 'sales' },
        {
          key: 'price' as const,
          label: t('category.sortPrice'),
          active: sort === 'price_asc' || sort === 'price_desc',
          arrow: sort === 'price_asc' ? '↑' : sort === 'price_desc' ? '↓' : '↕',
        },
        { key: 'newest' as const, label: t('category.sortNewest'), active: sort === 'newest' },
      ],
    [sort, t],
  )

  return (
    <View className='category'>
      <Header
        showSearch
        searchEditable
        searchValue={keyword}
        onSearchInput={setKeyword}
        onSearchConfirm={setKeyword}
        showBack={Boolean(router.params.from)}
      />
      <View style={{ height: `${headerHeight}px` }} />

      {/* ---- 並び替え ---- */}
      <View className='category__sorts'>
        {sortTabs.map((tab) => (
          <View
            key={tab.key}
            className={`category__sort ${tab.active ? 'is-active' : ''}`}
            hoverClass='category__sort--hover'
            onClick={() => handleSort(tab.key)}
          >
            <Text>{tab.label}</Text>
            {'arrow' in tab && <Text className='category__sort-arrow'>{tab.arrow}</Text>}
          </View>
        ))}
      </View>

      <View className='category__body'>
        {/* ---- サイドバー ---- */}
        <ScrollView className='category__sidebar' scrollY showScrollbar={false}>
          {categories.map((category) => (
            <View
              key={category.id}
              className={`category__side-item ${
                category.id === activeCategoryId && !keyword ? 'is-active' : ''
              }`}
              onClick={() => {
                setKeyword('')
                setActiveCategoryId(category.id)
              }}
            >
              <Text className='category__side-text'>{tx(category.name)}</Text>
            </View>
          ))}
        </ScrollView>

        {/* ---- 商品グリッド ---- */}
        <ScrollView
          className='category__list'
          scrollY
          showScrollbar={false}
          lowerThreshold={120}
          onScrollToLower={loadMore}
        >
          {loading ? (
            <Loading loading variant='inline' />
          ) : products.length === 0 ? (
            <Empty text={t('category.emptyProducts')} />
          ) : (
            <>
              <View className='category__grid'>
                {products.map((product) => (
                  <View key={product.id} className='category__grid-cell'>
                    <ProductCard product={product} variant='grid' />
                  </View>
                ))}
              </View>

              {loadingMore && <Loading loading variant='inline' />}
              {!hasMore && products.length > PAGE_SIZE / 2 && (
                <View className='category__end'>
                  <Text>— {t('common.all')} —</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  )
}
