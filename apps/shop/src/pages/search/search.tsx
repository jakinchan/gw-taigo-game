import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { Product } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { getScreenMetrics } from '@/utils/platform'
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from '@/utils/searchHistory'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './search.scss'

const PAGE_SIZE = 20

/** 検索候補。実運用では管理画面 or 集計から供給する。 */
const HOT_KEYWORDS = ['维生素', '鱼油', '益生菌', '胶原蛋白', '青汁', '钙片']

/**
 * 検索ページ。
 *
 * tabBar ページ（分类）へは navigateTo できないため、検索は独立ページにしている。
 * 未入力時は履歴と人気キーワード、入力確定後に結果グリッドを出す。
 */
export default function Search() {
  const router = useRouter()
  const { t } = useI18n()

  const [keyword, setKeyword] = useState('')
  /** 実際に検索を実行した語。入力中の keyword とは区別する。 */
  const [submitted, setSubmitted] = useState('')
  const [history, setHistory] = useState<string[]>([])

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const statusBarHeight = useMemo(() => getScreenMetrics().statusBarHeight, [])

  useEffect(() => {
    setHistory(getSearchHistory())
  }, [])

  // 他ページから初期キーワード付きで開かれた場合
  useEffect(() => {
    const initial = router.params.keyword ? decodeURIComponent(router.params.keyword) : ''
    if (initial) {
      setKeyword(initial)
      setSubmitted(initial)
    }
  }, [router.params.keyword])

  const fetchPage = useCallback(async (word: string, targetPage: number) => {
    const result = await productApi.list({
      keyword: word,
      page: targetPage,
      pageSize: PAGE_SIZE,
    })
    setTotal(result.total)
    setHasMore(result.hasMore)
    setProducts((prev) => (targetPage === 1 ? result.list : [...prev, ...result.list]))
  }, [])

  useEffect(() => {
    if (!submitted) {
      setProducts([])
      setTotal(0)
      setHasMore(false)
      return
    }
    setLoading(true)
    setPage(1)
    fetchPage(submitted, 1)
      .catch((err) => console.error('[search] failed', err))
      .finally(() => setLoading(false))
  }, [submitted, fetchPage])

  const runSearch = (word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return
    setKeyword(trimmed)
    setSubmitted(trimmed)
    setHistory(addSearchHistory(trimmed))
  }

  const loadMore = async () => {
    if (!hasMore || loading || loadingMore) return
    setLoadingMore(true)
    const next = page + 1
    try {
      await fetchPage(submitted, next)
      setPage(next)
    } catch (err) {
      console.error('[search] load more failed', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleClearHistory = async () => {
    const { confirm } = await Taro.showModal({
      title: t('search.clearHistory'),
      content: t('search.clearConfirm'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    })
    if (!confirm) return
    clearSearchHistory()
    setHistory([])
  }

  return (
    <View className='search'>
      {/* ---- 検索バー ---- */}
      <View className='search__bar' style={{ paddingTop: `${statusBarHeight + 8}px` }}>
        <View className='search__field'>
          <Text className='search__field-icon'>🔍</Text>
          <Input
            className='search__input'
            value={keyword}
            placeholder={t('search.placeholder')}
            placeholderClass='search__placeholder'
            confirmType='search'
            focus
            maxlength={64}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={(e) => runSearch(e.detail.value)}
          />
          {keyword.length > 0 && (
            <Text
              className='search__clear'
              onClick={() => {
                setKeyword('')
                setSubmitted('')
              }}
            >
              ✕
            </Text>
          )}
        </View>

        <Text className='search__cancel' onClick={() => Taro.navigateBack()}>
          {t('search.cancel')}
        </Text>
      </View>

      {/* ---- 未検索: 履歴と人気キーワード ---- */}
      {!submitted && (
        <View className='search__panels'>
          {history.length > 0 && (
            <View className='search__panel'>
              <View className='search__panel-head'>
                <Text className='search__panel-title'>{t('search.history')}</Text>
                <Text className='search__panel-action' onClick={handleClearHistory}>
                  🗑 {t('search.clearHistory')}
                </Text>
              </View>
              <View className='search__tags'>
                {history.map((item) => (
                  <View
                    key={item}
                    className='search__tag'
                    hoverClass='search__tag--hover'
                    onClick={() => runSearch(item)}
                    onLongPress={() => setHistory(removeSearchHistory(item))}
                  >
                    <Text>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className='search__panel'>
            <View className='search__panel-head'>
              <Text className='search__panel-title'>{t('search.hot')}</Text>
            </View>
            <View className='search__tags'>
              {HOT_KEYWORDS.map((item) => (
                <View
                  key={item}
                  className='search__tag search__tag--hot'
                  hoverClass='search__tag--hover'
                  onClick={() => runSearch(item)}
                >
                  <Text>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ---- 検索結果 ---- */}
      {submitted && (
        <ScrollView
          className='search__results'
          scrollY
          showScrollbar={false}
          lowerThreshold={120}
          onScrollToLower={loadMore}
        >
          {loading ? (
            <Loading loading variant='inline' />
          ) : products.length === 0 ? (
            <Empty text={t('search.noResult')} icon='🔍' actionText={t('search.noResultTip')} />
          ) : (
            <>
              <Text className='search__count'>{t('search.resultCount', { count: total })}</Text>
              <View className='search__grid'>
                {products.map((product) => (
                  <View key={product.id} className='search__grid-cell'>
                    <ProductCard product={product} variant='grid2' />
                  </View>
                ))}
              </View>
              {loadingMore && <Loading loading variant='inline' />}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}
