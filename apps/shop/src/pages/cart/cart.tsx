import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Coupon } from '@/types'
import { userApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import {
  selectAllSelected,
  selectSelectedItems,
  selectSubtotalCny,
  useCartStore,
} from '@/store/cart'
import { formatCny } from '@/utils/currency'
import { toUserMessage } from '@/utils/request'
import SafeImage from '@/components/SafeImage'
import QuantityStepper from '@/components/QuantityStepper'
import Empty from '@/components/Empty'

import './cart.scss'

type AppliedCoupon = Coupon & { discountCny: number }

/**
 * 购物车（カート）。
 *
 * 金額はここでも計算するが、あくまで表示用。
 * 実際の請求額は checkout で /orders/preview を叩いてサーバに再計算させる。
 */
export default function Cart() {
  const { t, tx } = useI18n()

  const items = useCartStore((s) => s.items)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const toggleSelect = useCartStore((s) => s.toggleSelect)
  const toggleSelectAll = useCartStore((s) => s.toggleSelectAll)
  const removeSelected = useCartStore((s) => s.removeSelected)
  const remove = useCartStore((s) => s.remove)

  const subtotal = useCartStore(selectSubtotalCny)
  const selected = useCartStore(selectSelectedItems)
  const allSelected = useCartStore(selectAllSelected)

  const [couponCode, setCouponCode] = useState('')
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [applying, setApplying] = useState(false)

  const discount = coupon?.discountCny ?? 0
  const total = Math.max(subtotal - discount, 0)

  const applyCoupon = async () => {
    const code = couponCode.trim()
    if (!code || applying) return

    setApplying(true)
    try {
      const result = await userApi.validateCoupon(code, subtotal)
      setCoupon(result)
      Taro.showToast({ title: t('cart.couponApplied'), icon: 'success' })
    } catch (err) {
      setCoupon(null)
      Taro.showToast({
        title: toUserMessage(err, t('cart.couponInvalid')),
        icon: 'none',
        duration: 2000,
      })
    } finally {
      setApplying(false)
    }
  }

  const confirmDelete = async () => {
    if (selected.length === 0) {
      Taro.showToast({ title: t('cart.selectItemFirst'), icon: 'none' })
      return
    }
    const { confirm } = await Taro.showModal({
      title: t('cart.delete'),
      content: t('cart.deleteConfirm'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      confirmColor: '#e53935',
    })
    if (confirm) removeSelected()
  }

  const goCheckout = () => {
    if (selected.length === 0) {
      Taro.showToast({ title: t('cart.selectItemFirst'), icon: 'none' })
      return
    }
    const query = coupon ? `&coupon=${encodeURIComponent(coupon.code)}` : ''
    Taro.navigateTo({ url: `/pages/checkout/checkout?mode=cart${query}` })
  }

  if (items.length === 0) {
    return (
      <Empty
        text={t('cart.empty')}
        icon='🛒'
        actionText={t('cart.goShopping')}
        onAction={() => Taro.switchTab({ url: '/pages/index/index' })}
      />
    )
  }

  return (
    <View className='cart'>
      <View className='cart__list'>
        {items.map((item) => (
          <View key={item.productId} className='cart__item'>
            <View
              className={`cart__check ${item.selected ? 'is-checked' : ''}`}
              onClick={() => toggleSelect(item.productId)}
              aria-role='checkbox'
              aria-checked={item.selected}
            >
              {item.selected && <Text className='cart__check-mark'>✓</Text>}
            </View>

            <SafeImage
              className='cart__thumb'
              src={item.thumbnail} options={{ width: 80, height: 80 }}
              mode='aspectFill'
              lazyLoad
              onClick={() =>
                Taro.navigateTo({ url: `/pages/product/detail?id=${item.productId}` })
              }
            />

            <View className='cart__info'>
              <Text className='cart__name'>{tx(item.name)}</Text>
              <Text className='cart__sku'>{item.sku}</Text>

              <View className='cart__row'>
                <View className='cart__price'>
                  <Text className='cart__price-cny'>¥{formatCny(item.priceCny)}</Text>
                </View>

                <QuantityStepper
                  value={item.quantity}
                  max={item.stock}
                  size='sm'
                  onChange={(next) => setQuantity(item.productId, next)}
                />
              </View>

              {item.quantity >= item.stock && (
                <Text className='cart__stock-warn'>
                  {t('product.stock')}: {item.stock}
                </Text>
              )}
            </View>

            <View
              className='cart__remove'
              hoverClass='cart__remove--hover'
              onClick={() => remove(item.productId)}
              aria-role='button'
              aria-label={t('cart.delete')}
            >
              <Text>×</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ---- クーポン ---- */}
      <View className='cart__coupon'>
        <Input
          className='cart__coupon-input'
          value={couponCode}
          placeholder={t('cart.couponPlaceholder')}
          placeholderClass='cart__coupon-placeholder'
          maxlength={32}
          onInput={(e) => setCouponCode(e.detail.value)}
          onConfirm={applyCoupon}
        />
        <View
          className={`cart__coupon-btn ${couponCode.trim() && !applying ? '' : 'is-disabled'}`}
          hoverClass='cart__coupon-btn--hover'
          onClick={applyCoupon}
        >
          <Text>{t('cart.couponApply')}</Text>
        </View>
      </View>

      {coupon && (
        <View className='cart__coupon-applied'>
          <Text className='cart__coupon-applied-name'>{tx(coupon.title)}</Text>
          <Text className='cart__coupon-applied-value'>−¥{formatCny(coupon.discountCny)}</Text>
        </View>
      )}

      <View className='cart__footer-space' />

      {/* ---- 固定フッター ---- */}
      <View className='cart__footer'>
        <View
          className={`cart__check ${allSelected ? 'is-checked' : ''}`}
          onClick={() => toggleSelectAll(!allSelected)}
          aria-role='checkbox'
          aria-checked={allSelected}
        >
          {allSelected && <Text className='cart__check-mark'>✓</Text>}
        </View>
        <Text className='cart__footer-all' onClick={() => toggleSelectAll(!allSelected)}>
          {t('cart.selectAll')}
        </Text>

        <View className='cart__footer-delete' onClick={confirmDelete}>
          <Text>{t('cart.delete')}</Text>
        </View>

        <View className='cart__footer-total'>
          <Text className='cart__footer-total-label'>{t('cart.total')}</Text>
          <Text className='cart__footer-total-value'>¥{formatCny(total)}</Text>
        </View>

        <View
          className={`cart__footer-btn ${selected.length === 0 ? 'is-disabled' : ''}`}
          hoverClass={selected.length === 0 ? 'none' : 'cart__footer-btn--hover'}
          onClick={goCheckout}
        >
          <Text>
            {t('cart.checkout')}
            {selected.length > 0 ? `(${selected.length})` : ''}
          </Text>
        </View>
      </View>
    </View>
  )
}
