import { useEffect, useMemo, useState } from 'react'
import { View, Text, Swiper, SwiperItem, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import type { Product, Review } from '@/types'
import { productApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useCartStore } from '@/store/cart'
import { usePreferenceStore } from '@/store/preference'
import { cnyToJpy, formatJpy, getFxRate } from '@/utils/currency'
import { IMAGE_PRESET } from '@/utils/image'
import SafeImage from '@/components/SafeImage'
import PriceTag from '@/components/PriceTag'
import QuantityStepper from '@/components/QuantityStepper'
import ProductCard from '@/components/ProductCard'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './detail.scss'

type Tab = 'detail' | 'review' | 'related'

/**
 * 商品详情页（商品詳細）。
 *
 * 画像スライド → 価格/在庫 → 数量 → タブ（詳細/レビュー/関連） → 固定フッター。
 * 賞味期限は「最も期限が近いロット（FEFO で先に出荷される玉）」を表示する。
 * 実際に届くロットを示すのが誠実で、返品トラブルも減る。
 */
export default function ProductDetail() {
  const router = useRouter()
  const productId = router.params.id ?? ''

  const { t, tx, locale } = useI18n()
  const addToCart = useCartStore((s) => s.add)
  const showJpy = usePreferenceStore((s) => s.showJpy)
  const toggleShowJpy = usePreferenceStore((s) => s.toggleShowJpy)

  const [product, setProduct] = useState<Product | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [related, setRelated] = useState<Product[]>([])
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState<Tab>('detail')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId) {
      setLoading(false)
      return
    }
    setLoading(true)
    productApi
      .detail(productId)
      .then(setProduct)
      .catch((err) => console.error('[detail] load failed', err))
      .finally(() => setLoading(false))
  }, [productId])

  // レビューと関連商品は初期表示に不要なので、タブが開かれてから取りに行く
  useEffect(() => {
    if (tab === 'review' && reviews.length === 0 && productId) {
      productApi
        .reviews(productId)
        .then((r) => setReviews(r.list))
        .catch((err) => console.error('[detail] load reviews failed', err))
    }
    if (tab === 'related' && related.length === 0 && productId) {
      productApi
        .related(productId)
        .then(setRelated)
        .catch((err) => console.error('[detail] load related failed', err))
    }
  }, [tab, productId, reviews.length, related.length])

  useShareAppMessage(() => ({
    title: product ? tx(product.name) : t('common.appName'),
    path: `/pages/product/detail?id=${productId}`,
    imageUrl: product?.thumbnail,
  }))

  /** FEFO 運用のため、最も期限が近いロットを表示対象にする */
  const nearestBatch = useMemo(() => {
    if (!product?.batches?.length) return null
    return [...product.batches]
      .filter((b) => b.quantity > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]
  }, [product])

  const soldOut = !product || product.stock <= 0

  const handleAddToCart = () => {
    if (!product || soldOut) return
    addToCart(product, quantity)
    Taro.vibrateShort({ type: 'light' }).catch(() => {})
    Taro.showToast({ title: t('product.addedToCart'), icon: 'success', duration: 1200 })
  }

  const handleBuyNow = () => {
    if (!product || soldOut) return
    // カートを経由せず、この商品だけで決済フローに入る
    Taro.setStorageSync('hfs:buyNow', [{ productId: product.id, quantity }])
    Taro.navigateTo({ url: '/pages/checkout/checkout?mode=buyNow' })
  }

  if (loading) return <Loading loading variant='page' />

  if (!product) {
    return (
      <Empty
        text={t('common.empty')}
        actionText={t('common.back')}
        onAction={() => Taro.navigateBack()}
      />
    )
  }

  return (
    <View className='detail'>
      {/* ---- 画像スライド ---- */}
      <Swiper
        className='detail__gallery'
        indicatorDots
        indicatorColor='rgba(255,255,255,0.5)'
        indicatorActiveColor='#ffffff'
        circular
      >
        {product.images.map((src, i) => (
          <SwiperItem key={i}>
            <SafeImage
              className='detail__gallery-image'
              src={src} options={IMAGE_PRESET.productDetail}
              mode='aspectFill'
              lazyLoad={i > 0}
              onClick={() =>
                Taro.previewImage({ current: src, urls: product.images })
              }
            />
          </SwiperItem>
        ))}
      </Swiper>

      {/* ---- 価格・タイトル ---- */}
      <View className='detail__summary'>
        <View className='detail__price-row'>
          <PriceTag
            priceCny={product.priceCny}
            originalPriceCny={product.originalPriceCny}
            size='lg'
            jpyPosition='none'
          />
          <View
            className={`detail__jpy-toggle ${showJpy ? 'is-on' : ''}`}
            hoverClass='detail__jpy-toggle--hover'
            onClick={toggleShowJpy}
          >
            <Text>JPY</Text>
          </View>
        </View>

        {showJpy && (
          <Text className='detail__jpy'>
            {t('common.approx')} ￥{formatJpy(cnyToJpy(product.priceCny))}
            <Text className='detail__jpy-note'>
              （1 CNY ≈ {getFxRate().toFixed(2)} JPY・{t('currency.rateNote')}）
            </Text>
          </Text>
        )}

        <Text className='detail__name'>{tx(product.name)}</Text>
        <Text className='detail__subtitle'>{tx(product.subtitle)}</Text>

        <View className='detail__meta'>
          <Text className='detail__meta-item'>
            {t('product.sales')} {product.salesCount}
          </Text>
          <Text className='detail__meta-item'>
            {t('product.stock')} {product.stock}
          </Text>
          <Text className='detail__meta-item'>
            ★ {product.rating.toFixed(1)}（{product.reviewCount}
            {t('product.reviewCount')}）
          </Text>
        </View>

        {product.isCrossBorder && (
          <View className='detail__notice'>
            <Text className='detail__notice-tag'>{t('product.crossBorder')}</Text>
            <Text className='detail__notice-text'>{t('product.crossBorderNote')}</Text>
          </View>
        )}
      </View>

      {/* ---- ロット・期限 ---- */}
      <View className='detail__block'>
        <View className='detail__row'>
          <Text className='detail__row-label'>{t('product.origin')}</Text>
          <Text className='detail__row-value'>{product.originCountry}</Text>
        </View>
        {nearestBatch && (
          <>
            <View className='detail__row'>
              <Text className='detail__row-label'>{t('product.expiry')}</Text>
              <Text className='detail__row-value'>{nearestBatch.expiryDate}</Text>
            </View>
            <View className='detail__row'>
              <Text className='detail__row-label'>{t('product.batchNo')}</Text>
              <Text className='detail__row-value'>{nearestBatch.batchNo}</Text>
            </View>
          </>
        )}
        {product.approvalNumber && (
          <View className='detail__row'>
            <Text className='detail__row-label'>{t('product.approvalNumber')}</Text>
            <Text className='detail__row-value'>{product.approvalNumber}</Text>
          </View>
        )}
        <View className='detail__row'>
          <Text className='detail__row-label'>{t('product.quantity')}</Text>
          <QuantityStepper
            value={quantity}
            max={Math.max(product.stock, 1)}
            disabled={soldOut}
            onChange={setQuantity}
          />
        </View>
      </View>

      {/* ---- タブ ---- */}
      <View className='detail__tabs'>
        {(
          [
            ['detail', t('product.tabDetail')],
            ['review', t('product.tabReview')],
            ['related', t('product.tabRelated')],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <View
            key={key}
            className={`detail__tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Text>{label}</Text>
          </View>
        ))}
      </View>

      <View className='detail__tab-body'>
        {tab === 'detail' && (
          <View className='detail__block'>
            <Section title={t('product.specification')} body={tx(product.description)} />
            <Section title={t('product.ingredients')} body={tx(product.ingredients)} />

            {/* 栄養成分表は法定表示なので、本文とは別に表形式で見せる */}
            {product.nutrition && product.nutrition.length > 0 && (
              <View className='detail__section'>
                <Text className='detail__section-title'>{t('product.nutrition')}</Text>

                <View className='detail__nutrition'>
                  <View className='detail__nutrition-row detail__nutrition-row--head'>
                    <Text className='detail__nutrition-name'>{t('product.nutritionItem')}</Text>
                    <Text className='detail__nutrition-amount'>
                      {t('product.nutritionAmount')}
                    </Text>
                    <Text className='detail__nutrition-nrv'>{t('product.nutritionNrv')}</Text>
                  </View>

                  {product.nutrition.map((item, i) => (
                    <View key={i} className='detail__nutrition-row'>
                      <Text className='detail__nutrition-name'>{tx(item.name)}</Text>
                      <Text className='detail__nutrition-amount'>{item.amount}</Text>
                      <Text className='detail__nutrition-nrv'>
                        {item.nrvPercent == null ? '—' : `${item.nrvPercent}%`}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text className='detail__nutrition-note'>{t('product.nutritionNote')}</Text>
              </View>
            )}

            <Section title={t('product.benefits')} body={tx(product.benefits)} />
            <Section title={t('product.usage')} body={tx(product.usage)} />

            <View className='detail__disclaimer'>
              <Text>{t('product.healthDisclaimer')}</Text>
            </View>
          </View>
        )}

        {tab === 'review' &&
          (reviews.length === 0 ? (
            <Empty text={t('product.noReview')} icon='💬' />
          ) : (
            <View className='detail__reviews'>
              {reviews.map((review) => (
                <View key={review.id} className='detail__review'>
                  <View className='detail__review-head'>
                    <SafeImage
                      className='detail__review-avatar'
                      src={review.userAvatar} options={IMAGE_PRESET.avatar}
                      mode='aspectFill'
                      lazyLoad
                    />
                    <Text className='detail__review-name'>{review.userNickname}</Text>
                    <Text className='detail__review-stars'>{'★'.repeat(review.rating)}</Text>
                  </View>
                  <Text className='detail__review-content'>{review.content}</Text>
                  {review.images.length > 0 && (
                    <ScrollView className='detail__review-images' scrollX showScrollbar={false}>
                      <View className='detail__review-images-inner'>
                        {review.images.map((src) => (
                          <SafeImage
                            key={src}
                            className='detail__review-image'
                            src={src} options={{ width: 80, height: 80 }}
                            mode='aspectFill'
                            lazyLoad
                            onClick={() =>
                              Taro.previewImage({ current: src, urls: review.images })
                            }
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  <Text className='detail__review-date'>
                    {new Date(review.createdAt).toLocaleDateString(locale)}
                  </Text>
                </View>
              ))}
            </View>
          ))}

        {tab === 'related' && (
          <View className='detail__related'>
            {related.map((item) => (
              <View key={item.id} className='detail__related-cell'>
                <ProductCard product={item} variant='grid2' />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ---- 固定フッター ---- */}
      <View className='detail__footer-space' />
      <View className='detail__footer'>
        <View
          className='detail__footer-icon'
          hoverClass='detail__footer-icon--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/cart/cart' })}
        >
          <Text className='detail__footer-icon-glyph'>🛒</Text>
          <Text className='detail__footer-icon-label'>{t('tabBar.cart')}</Text>
        </View>

        <View
          className={`detail__footer-btn detail__footer-btn--outline ${soldOut ? 'is-disabled' : ''}`}
          hoverClass={soldOut ? 'none' : 'detail__footer-btn--hover'}
          onClick={handleAddToCart}
        >
          <Text>{t('product.addToCart')}</Text>
        </View>

        <View
          className={`detail__footer-btn detail__footer-btn--primary ${soldOut ? 'is-disabled' : ''}`}
          hoverClass={soldOut ? 'none' : 'detail__footer-btn--hover'}
          onClick={handleBuyNow}
        >
          <Text>{soldOut ? t('product.stockOut') : t('product.buyNow')}</Text>
        </View>
      </View>
    </View>
  )
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body) return null
  return (
    <View className='detail__section'>
      <Text className='detail__section-title'>{title}</Text>
      <Text className='detail__section-body'>{body}</Text>
    </View>
  )
}
