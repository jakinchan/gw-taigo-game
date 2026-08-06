import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { OrderStatus } from '@/types'
import { useI18n } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { imageUrl, IMAGE_PRESET } from '@/utils/image'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import logo from '@/assets/logo.png'

import './user.scss'

/**
 * 我的（マイページ）。
 *
 * ヘッダーはメインカラーのグラデーションにして、ステータスバー分の余白を
 * 自前で確保する（navigationStyle: 'custom'）。
 */
export default function User() {
  const { t } = useI18n()
  const profile = useUserStore((s) => s.profile)
  const isLoggedIn = useUserStore((s) => s.isLoggedIn)
  const loading = useUserStore((s) => s.loading)
  const signIn = useUserStore((s) => s.signIn)
  const restore = useUserStore((s) => s.restore)

  useDidShow(() => {
    void restore()
  })

  let statusBarHeight = 20
  try {
    statusBarHeight = Taro.getSystemInfoSync().statusBarHeight ?? 20
  } catch {
    /* fallthrough */
  }

  const orderEntries: { status: OrderStatus; label: string; icon: string }[] = [
    { status: 'pending_payment', label: t('user.orderPendingPayment'), icon: '💰' },
    { status: 'pending_shipment', label: t('user.orderPendingShipment'), icon: '📦' },
    { status: 'shipped', label: t('user.orderShipped'), icon: '🚚' },
    { status: 'completed', label: t('user.orderCompleted'), icon: '✅' },
  ]

  const menus = [
    { icon: '📍', label: t('user.addressManage'), url: '/pages/address/list' },
    { icon: '🎫', label: t('user.coupons'), url: '/pages/settings/settings?tab=coupons' },
    { icon: '💬', label: t('user.support'), url: '', contact: true },
    { icon: '⚙️', label: t('user.settings'), url: '/pages/settings/settings' },
  ]

  return (
    <View className='user'>
      {/* ---- ヘッダー ---- */}
      <View className='user__hero' style={{ paddingTop: `${statusBarHeight + 12}px` }}>
        <View className='user__hero-top'>
          <LanguageSwitcher variant='compact' inverse />
        </View>

        <View className='user__profile'>
          <Image
            className='user__avatar'
            src={profile?.avatar ? imageUrl(profile.avatar, IMAGE_PRESET.avatar) : logo}
            mode='aspectFill'
          />

          <View className='user__profile-body'>
            {isLoggedIn && profile ? (
              <>
                <Text className='user__nickname'>{profile.nickname}</Text>
                <View className='user__badges'>
                  <Text className='user__level'>
                    {t(`user.memberLevel.${profile.memberLevel}` as 'user.memberLevel.normal')}
                  </Text>
                  <Text className='user__points'>
                    {profile.points} {t('user.points')}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text className='user__nickname'>{t('user.login')}</Text>
                <Text className='user__login-tip'>{t('user.loginTip')}</Text>
              </>
            )}
          </View>

          {!isLoggedIn && (
            <Button
              className='user__login-btn'
              loading={loading}
              onClick={() => void signIn()}
            >
              {t('user.login')}
            </Button>
          )}
        </View>
      </View>

      {/* ---- 注文ステータス ---- */}
      <View className='user__card'>
        <View className='user__card-head'>
          <Text className='user__card-title'>{t('user.myOrders')}</Text>
          <Text
            className='user__card-more'
            onClick={() => Taro.navigateTo({ url: '/pages/order/list' })}
          >
            {t('common.all')} ›
          </Text>
        </View>

        <View className='user__orders'>
          {orderEntries.map((entry) => (
            <View
              key={entry.status}
              className='user__order-entry'
              hoverClass='user__order-entry--hover'
              onClick={() => Taro.navigateTo({ url: `/pages/order/list?status=${entry.status}` })}
            >
              <Text className='user__order-icon'>{entry.icon}</Text>
              <Text className='user__order-label'>{entry.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---- 機能メニュー ---- */}
      <View className='user__card user__card--menu'>
        {menus.map((menu) =>
          menu.contact ? (
            // カスタマーサポートは微信の公式カスタマーサービスを開く
            <Button key={menu.label} className='user__menu' openType='contact'>
              <Text className='user__menu-icon'>{menu.icon}</Text>
              <Text className='user__menu-label'>{menu.label}</Text>
              <Text className='user__menu-arrow'>›</Text>
            </Button>
          ) : (
            <View
              key={menu.label}
              className='user__menu'
              hoverClass='user__menu--hover'
              onClick={() => Taro.navigateTo({ url: menu.url })}
            >
              <Text className='user__menu-icon'>{menu.icon}</Text>
              <Text className='user__menu-label'>{menu.label}</Text>
              <Text className='user__menu-arrow'>›</Text>
            </View>
          ),
        )}
      </View>

      <View className='user__disclaimer'>
        <Text>{t('product.healthDisclaimer')}</Text>
      </View>
    </View>
  )
}
