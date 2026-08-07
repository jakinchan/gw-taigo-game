import { useCallback, useEffect, useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { Address, Order, ShippingMethod } from '@/types'
import { orderApi, userApi } from '@/services/api'
import { payOrder } from '@/services/wechatPay'
import { useI18n } from '@/services/i18n'
import { selectSelectedItems, useCartStore } from '@/store/cart'
import { formatCny } from '@/utils/currency'
import { isErrorCode, toUserMessage } from '@/utils/request'
import SafeImage from '@/components/SafeImage'
import Loading from '@/components/Loading'

import './checkout.scss'

interface OrderLine {
  productId: string
  quantity: number
}

/**
 * 注文確認・決済ページ。
 *
 * 金額は必ずサーバの /orders/preview が返す値を表示する。
 * クライアントで送料・税を計算して見せると、サーバの確定額とズレたときに
 * 「表示と違う額が引き落とされた」という最悪のクレームになる。
 */
export default function Checkout() {
  const router = useRouter()
  const mode = (router.params.mode as 'cart' | 'buyNow') ?? 'cart'
  const couponCode = router.params.coupon ? decodeURIComponent(router.params.coupon) : undefined

  const { t, tx } = useI18n()
  const cartItems = useCartStore(selectSelectedItems)
  const removeMany = useCartStore((s) => s.removeMany)

  const [lines, setLines] = useState<OrderLine[]>([])
  const [address, setAddress] = useState<Address | null>(null)
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard')
  const [remark, setRemark] = useState('')

  const [preview, setPreview] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // ---- 注文対象の確定 ----
  useEffect(() => {
    if (mode === 'buyNow') {
      const buyNow = (Taro.getStorageSync('hfs:buyNow') as OrderLine[]) || []
      setLines(buyNow)
    } else {
      setLines(cartItems.map((item) => ({ productId: item.productId, quantity: item.quantity })))
    }
    // cartItems は毎レンダーで新しい配列になるため依存に入れない（初回だけ確定させたい）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ---- 住所 ----
  const loadAddress = useCallback(async () => {
    try {
      const list = await userApi.addresses()
      const selectedId = Taro.getStorageSync('hfs:selectedAddressId') as string
      const picked =
        list.find((a) => a.id === selectedId) ?? list.find((a) => a.isDefault) ?? list[0] ?? null
      setAddress(picked)
    } catch (err) {
      console.error('[checkout] load address failed', err)
    }
  }, [])

  useEffect(() => {
    void loadAddress()
  }, [loadAddress])

  // 住所一覧ページから戻ってきたときに選択を反映する
  useDidShow(() => {
    void loadAddress()
  })

  // ---- 金額プレビュー（サーバ計算） ----
  useEffect(() => {
    if (lines.length === 0 || !address) {
      setLoading(false)
      return
    }
    setLoading(true)
    orderApi
      .preview({ items: lines, addressId: address.id, shippingMethod, couponCode })
      .then(setPreview)
      .catch((err) => {
        console.error('[checkout] preview failed', err)
        Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
      })
      .finally(() => setLoading(false))
  }, [lines, address, shippingMethod, couponCode, t])

  const submit = async () => {
    if (submitting) return

    if (!address) {
      Taro.showToast({ title: t('checkout.selectAddress'), icon: 'none' })
      return
    }
    if (lines.length === 0) {
      Taro.showToast({ title: t('cart.selectItemFirst'), icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      // 1. 注文作成（在庫引き当てはサーバ側で実施）
      const order = await orderApi.create({
        items: lines,
        addressId: address.id,
        shippingMethod,
        couponCode,
        remark: remark.trim() || undefined,
      })

      // 2. 微信支付
      const result = await payOrder(order)

      if (result.status === 'success') {
        // カート経由の注文だけカートから取り除く
        if (mode === 'cart') removeMany(lines.map((l) => l.productId))
        Taro.removeStorageSync('hfs:buyNow')

        await Taro.showToast({ title: t('checkout.paySuccess'), icon: 'success', duration: 1500 })
        // 注文一覧の「待发货」タブへ置き換え遷移する（戻るで決済画面に戻さない）
        Taro.redirectTo({ url: '/pages/order/list?status=pending_shipment' })
        return
      }

      if (result.status === 'cancelled') {
        Taro.showToast({ title: t('checkout.payCancelled'), icon: 'none' })
      } else {
        Taro.showModal({
          title: t('checkout.payFailed'),
          content: result.reason,
          showCancel: false,
          confirmText: t('common.confirm'),
        })
      }
      // 未払い注文として残るので、注文一覧から再決済できる
      Taro.redirectTo({ url: '/pages/order/list?status=pending_payment' })
    } catch (err) {
      console.error('[checkout] submit failed', err)

      /**
       * 越境EC 特有の失敗は、トーストで終わらせず次の行動へ導く。
       * 「なぜ買えないのか」が分からないまま放置されるのが一番の離脱要因。
       */
      if (isErrorCode(err, 'REAL_NAME_REQUIRED')) {
        const { confirm } = await Taro.showModal({
          title: t('checkout.realNameRequired'),
          content: t('checkout.realNameRequiredNote'),
          confirmText: t('checkout.goVerify'),
          cancelText: t('common.cancel'),
        })
        if (confirm) Taro.navigateTo({ url: '/pages/settings/settings?tab=realName' })
        return
      }

      if (isErrorCode(err, 'SINGLE_LIMIT_EXCEEDED') || isErrorCode(err, 'ANNUAL_LIMIT_EXCEEDED')) {
        Taro.showModal({
          title: t('checkout.limitExceeded'),
          content: toUserMessage(err, t('checkout.limitExceededNote')),
          showCancel: false,
          confirmText: t('common.confirm'),
        })
        return
      }

      Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const amounts = preview?.amounts
  const displayItems = preview?.items ?? []

  return (
    <View className='checkout'>
      {/* ---- 配送先 ---- */}
      <View
        className='checkout__address'
        hoverClass='checkout__address--hover'
        onClick={() => Taro.navigateTo({ url: '/pages/address/list?select=1' })}
      >
        {address ? (
          <>
            <View className='checkout__address-head'>
              <Text className='checkout__address-name'>{address.receiverName}</Text>
              <Text className='checkout__address-phone'>{address.phone}</Text>
              {address.isDefault && <Text className='checkout__address-tag'>默认</Text>}
            </View>
            <Text className='checkout__address-detail'>
              {address.province}
              {address.city}
              {address.district} {address.detail}
            </Text>
          </>
        ) : (
          <Text className='checkout__address-empty'>＋ {t('checkout.addAddress')}</Text>
        )}
        <Text className='checkout__arrow'>›</Text>
      </View>

      {/* ---- 商品一覧 ---- */}
      <View className='checkout__card'>
        <Text className='checkout__card-title'>{t('checkout.items')}</Text>
        {displayItems.map((item) => (
          <View key={item.productId} className='checkout__item'>
            <SafeImage
              className='checkout__item-thumb'
              src={item.thumbnail} options={{ width: 64, height: 64 }}
              mode='aspectFill'
              lazyLoad
            />
            <View className='checkout__item-info'>
              <Text className='checkout__item-name'>{tx(item.name)}</Text>
              <Text className='checkout__item-sku'>{item.sku}</Text>
            </View>
            <View className='checkout__item-right'>
              <Text className='checkout__item-price'>¥{formatCny(item.priceCny)}</Text>
              <Text className='checkout__item-qty'>×{item.quantity}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ---- 配送方法 ---- */}
      <View className='checkout__card'>
        <Text className='checkout__card-title'>{t('checkout.shipping')}</Text>
        {(
          [
            ['standard', t('checkout.shippingStandard'), t('checkout.shippingStandardDesc')],
            ['express', t('checkout.shippingExpress'), t('checkout.shippingExpressDesc')],
          ] as [ShippingMethod, string, string][]
        ).map(([method, label, desc]) => (
          <View
            key={method}
            className={`checkout__option ${shippingMethod === method ? 'is-active' : ''}`}
            onClick={() => setShippingMethod(method)}
          >
            <View className='checkout__radio'>
              {shippingMethod === method && <View className='checkout__radio-dot' />}
            </View>
            <View className='checkout__option-body'>
              <Text className='checkout__option-label'>{label}</Text>
              <Text className='checkout__option-desc'>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ---- 支払い方法 ---- */}
      <View className='checkout__card'>
        <Text className='checkout__card-title'>{t('checkout.payment')}</Text>
        <View className='checkout__option is-active'>
          <View className='checkout__radio'>
            <View className='checkout__radio-dot' />
          </View>
          <View className='checkout__option-body'>
            <Text className='checkout__option-label'>💚 {t('checkout.wechatPay')}</Text>
            <Text className='checkout__option-desc'>{t('checkout.wechatPayCrossBorder')}</Text>
          </View>
        </View>
      </View>

      {/* ---- 備考 ---- */}
      <View className='checkout__card'>
        <Text className='checkout__card-title'>{t('checkout.remark')}</Text>
        <Textarea
          className='checkout__remark'
          value={remark}
          placeholder={t('checkout.remarkPlaceholder')}
          placeholderClass='checkout__remark-placeholder'
          maxlength={200}
          onInput={(e) => setRemark(e.detail.value)}
        />
      </View>

      {/* ---- 金額内訳 ---- */}
      <View className='checkout__card'>
        {loading ? (
          <Loading loading variant='inline' />
        ) : amounts ? (
          <>
            <AmountRow label={t('checkout.subtotal')} value={`¥${formatCny(amounts.subtotalCny)}`} />
            <AmountRow
              label={t('checkout.shippingFee')}
              value={
                amounts.shippingFeeCny === 0
                  ? t('checkout.freeShipping')
                  : `¥${formatCny(amounts.shippingFeeCny)}`
              }
            />
            {amounts.taxCny > 0 && (
              <AmountRow label={t('checkout.tax')} value={`¥${formatCny(amounts.taxCny)}`} />
            )}
            {amounts.discountCny > 0 && (
              <AmountRow
                label={t('checkout.discount')}
                value={`−¥${formatCny(amounts.discountCny)}`}
                highlight
              />
            )}

            <View className='checkout__total'>
              <Text className='checkout__total-label'>{t('checkout.total')}</Text>
              <View className='checkout__total-values'>
                <Text className='checkout__total-cny'>¥{formatCny(amounts.totalCny)}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text className='checkout__amount-error'>{t('common.networkError')}</Text>
        )}
      </View>

      <View className='checkout__footer-space' />

      {/* ---- 固定フッター ---- */}
      <View className='checkout__footer'>
        <View className='checkout__footer-total'>
          <Text className='checkout__footer-label'>{t('checkout.total')}</Text>
          <Text className='checkout__footer-value'>
            ¥{formatCny(amounts?.totalCny ?? 0)}
          </Text>
        </View>

        <View
          className={`checkout__submit ${submitting || !amounts || !address ? 'is-disabled' : ''}`}
          hoverClass={submitting ? 'none' : 'checkout__submit--hover'}
          onClick={submit}
        >
          <Text>{submitting ? t('checkout.submitting') : t('checkout.submit')}</Text>
        </View>
      </View>
    </View>
  )
}

function AmountRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <View className='checkout__amount-row'>
      <Text className='checkout__amount-label'>{label}</Text>
      <Text className={`checkout__amount-value ${highlight ? 'is-highlight' : ''}`}>{value}</Text>
    </View>
  )
}
