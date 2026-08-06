import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { Coupon, OrderStatus } from '@/types'
import { userApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { formatCny } from '@/utils/currency'
import { IMAGE_PRESET } from '@/utils/image'
import SafeImage from '@/components/SafeImage'
import logo from '@/assets/logo.png'

import './user.scss'

/** 注文ステータス導線（实机は 5 つ。退款/售后 を含む） */
const ORDER_ENTRIES: { status: OrderStatus | 'refund'; labelKey: string; icon: string }[] = [
  { status: 'pending_payment', labelKey: 'user.orderPendingPayment', icon: '¥' },
  { status: 'pending_shipment', labelKey: 'user.orderPendingShipment', icon: '🏷' },
  { status: 'shipped', labelKey: 'user.orderShipped', icon: '🚚' },
  { status: 'completed', labelKey: 'user.orderPendingReview', icon: '💬' },
  { status: 'refund', labelKey: 'user.orderRefund', icon: '↺' },
]

export default function User() {
  const { t, tx } = useI18n()
  const profile = useUserStore((s) => s.profile)
  const isLoggedIn = useUserStore((s) => s.isLoggedIn)
  const loading = useUserStore((s) => s.loading)
  const signIn = useUserStore((s) => s.signIn)
  const restore = useUserStore((s) => s.restore)

  const [coupons, setCoupons] = useState<Coupon[]>([])

  useDidShow(() => {
    void restore()
  })

  useEffect(() => {
    if (!isLoggedIn) return
    userApi
      .coupons()
      .then(setCoupons)
      .catch((err) => console.error('[user] coupons failed', err))
  }, [isLoggedIn])

  const statusBarHeight = useMemo(() => {
    try {
      return Taro.getSystemInfoSync().statusBarHeight ?? 20
    } catch {
      return 20
    }
  }, [])

  const goOrders = (status: OrderStatus | 'refund') => {
    const query = status === 'refund' ? 'status=refunding' : `status=${status}`
    Taro.navigateTo({ url: `/pages/order/list?${query}` })
  }

  return (
    <View className='mine'>
      {/* ---- ブランド行 ---- */}
      <View className='mine__brand' style={{ paddingTop: `${statusBarHeight + 8}px` }}>
        <SafeImage className='mine__brand-logo' src={logo} mode='aspectFit' />
        <Text className='mine__brand-name'>{t('common.appName')}</Text>
        <Text className='mine__brand-reg'>®</Text>
      </View>

      {/* ---- プロフィール ---- */}
      <View className='mine__profile'>
        <SafeImage
          className='mine__avatar'
          src={profile?.avatar || logo}
          options={IMAGE_PRESET.avatar}
          fallback='avatar'
          mode='aspectFill'
        />

        {isLoggedIn && profile ? (
          <Text className='mine__nickname'>{profile.nickname || t('user.title')}</Text>
        ) : (
          <Button className='mine__login' loading={loading} onClick={() => void signIn()}>
            {t('user.tapForAvatar')}
          </Button>
        )}
      </View>

      {/* ---- 3 指標 ---- */}
      <View className='mine__stats'>
        {[
          { value: profile?.points ?? 0, labelKey: 'user.points' },
          { value: coupons.filter((c) => !c.used).length, labelKey: 'user.coupons' },
          { value: 0, labelKey: 'user.benefitCards' },
        ].map((stat) => (
          <View
            key={stat.labelKey}
            className='mine__stat'
            onClick={() => Taro.navigateTo({ url: '/pages/points/points' })}
          >
            <Text className='mine__stat-value'>{stat.value}</Text>
            <Text className='mine__stat-label'>{t(stat.labelKey as 'user.points')}</Text>
          </View>
        ))}
      </View>

      {/* ---- 券包バナー ---- */}
      <View
        className='mine__coupon-banner'
        hoverClass='mine__coupon-banner--hover'
        onClick={() => Taro.navigateTo({ url: '/pages/points/points?tab=coupon' })}
      >
        <View className='mine__coupon-banner-text'>
          <Text className='mine__coupon-banner-title'>{t('user.couponPack')}</Text>
          <View className='mine__coupon-banner-btn'>
            <Text>{t('user.claimAll')} →</Text>
          </View>
        </View>
        <Text className='mine__coupon-banner-coin'>🪙</Text>
      </View>

      {/* ---- 注文 ---- */}
      <View className='mine__card'>
        <View className='mine__card-head'>
          <Text className='mine__card-title'>{t('user.myOrders')}</Text>
          <Text
            className='mine__card-more'
            onClick={() => Taro.navigateTo({ url: '/pages/order/list' })}
          >
            {t('user.viewAll')} ›
          </Text>
        </View>

        <View className='mine__orders'>
          {ORDER_ENTRIES.map((entry) => (
            <View
              key={entry.status}
              className='mine__order'
              hoverClass='mine__order--hover'
              onClick={() => goOrders(entry.status)}
            >
              <Text className='mine__order-icon'>{entry.icon}</Text>
              <Text className='mine__order-label'>
                {t(entry.labelKey as 'user.orderPendingPayment')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---- 機能タイル（2 列） ---- */}
      <View className='mine__tiles'>
        {[
          { icon: '🪙', labelKey: 'user.pointsMall', url: '/pages/points/points' },
          { icon: '◈', labelKey: 'user.checkin', url: '/pages/points/points?tab=checkin' },
        ].map((tile) => (
          <View
            key={tile.labelKey}
            className='mine__tile'
            hoverClass='mine__tile--hover'
            onClick={() => Taro.navigateTo({ url: tile.url })}
          >
            <Text className='mine__tile-icon'>{tile.icon}</Text>
            <Text className='mine__tile-label'>{t(tile.labelKey as 'user.pointsMall')}</Text>
          </View>
        ))}
      </View>

      <View
        className='mine__tiles mine__tiles--single'
        onClick={() => Taro.navigateTo({ url: '/pages/points/points?tab=gift' })}
      >
        <View className='mine__tile' hoverClass='mine__tile--hover'>
          <Text className='mine__tile-icon'>🎁</Text>
          <Text className='mine__tile-label'>{t('user.giftExchange')}</Text>
        </View>
      </View>

      {/* ---- 交換可能なクーポン（横スクロール） ---- */}
      {coupons.length > 0 && (
        <ScrollView className='mine__coupons' scrollX showScrollbar={false}>
          <View className='mine__coupons-inner'>
            {coupons.map((coupon) => (
              <View key={coupon.id} className={`mine__coupon ${coupon.used ? 'is-used' : ''}`}>
                <Text className='mine__coupon-tag'>{t('user.memberCoupon')}</Text>
                <Text className='mine__coupon-value'>¥{formatCny(coupon.value)}</Text>
                <Text className='mine__coupon-cond'>{tx(coupon.title)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Text className='mine__note'>{t('user.pointsExpiry')}</Text>

      {/* ---- 設定・サポート ---- */}
      <View className='mine__card mine__card--menu'>
        <View
          className='mine__menu'
          hoverClass='mine__menu--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/address/list' })}
        >
          <Text className='mine__menu-icon'>📍</Text>
          <Text className='mine__menu-label'>{t('user.addressManage')}</Text>
          <Text className='mine__menu-arrow'>›</Text>
        </View>

        <Button className='mine__menu' openType='contact'>
          <Text className='mine__menu-icon'>💬</Text>
          <Text className='mine__menu-label'>{t('user.support')}</Text>
          <Text className='mine__menu-arrow'>›</Text>
        </Button>

        <View
          className='mine__menu'
          hoverClass='mine__menu--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/settings/settings' })}
        >
          <Text className='mine__menu-icon'>⚙️</Text>
          <Text className='mine__menu-label'>{t('user.settings')}</Text>
          <Text className='mine__menu-arrow'>›</Text>
        </View>
      </View>

      <View className='mine__disclaimer'>
        <Text>{t('product.healthDisclaimer')}</Text>
      </View>
    </View>
  )
}
