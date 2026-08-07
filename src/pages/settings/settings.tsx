import { useEffect, useState } from 'react'
import { View, Text, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Coupon } from '@/types'
import { userApi, fxApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { usePreferenceStore } from '@/store/preference'
import { useUserStore } from '@/store/user'
import { formatCny, getFxQuotedAt, getFxRate, setFxRate } from '@/utils/currency'
import { clearCache } from '@/utils/storage'
import LanguageSwitcher from '@/components/LanguageSwitcher'

import './settings.scss'

/** 设置（設定）＋クーポン一覧。`?tab=coupons` でクーポンを開いた状態にする。 */
export default function Settings() {
  const { t, tx } = useI18n()
  const showJpy = usePreferenceStore((s) => s.showJpy)
  const setShowJpy = usePreferenceStore((s) => s.setShowJpy)
  const isLoggedIn = useUserStore((s) => s.isLoggedIn)
  const signOut = useUserStore((s) => s.signOut)

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [notificationEnabled, setNotificationEnabled] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    userApi
      .coupons()
      .then(setCoupons)
      // 未ログインなら 401。クーポンを持っていない状態として扱えばよい。
      .catch(() => setCoupons([]))
  }, [isLoggedIn])

  // 通知の許可状態は微信の設定が正なので、そこから読む
  useEffect(() => {
    Taro.getSetting()
      .then((res) => setNotificationEnabled(Boolean(res.authSetting['scope.userInfo'])))
      .catch(() => {})
  }, [])

  const refreshFxRate = async () => {
    try {
      const { rate, quotedAt } = await fxApi.rate()
      setFxRate(rate, quotedAt)
      Taro.showToast({ title: `1 CNY ≈ ${rate.toFixed(2)} JPY`, icon: 'none' })
    } catch {
      Taro.showToast({ title: t('common.networkError'), icon: 'none' })
    }
  }

  return (
    <View className='settings'>
      {/* ---- 言語 ---- */}
      <View className='settings__card'>
        <Text className='settings__card-title'>{t('user.language')}</Text>
        <View className='settings__lang'>
          {/* 設定画面では選択肢を並べたセグメント表示にする */}
          <LanguageSwitcher variant='segmented' />
        </View>
      </View>

      {/* ---- 通貨表示 ---- */}
      <View className='settings__card'>
        <Text className='settings__card-title'>{t('currency.jpy')}</Text>

        <View className='settings__row'>
          <View className='settings__row-body'>
            <Text className='settings__row-label'>
              {t('currency.cny')} / {t('currency.jpy')}
            </Text>
            <Text className='settings__row-desc'>{t('currency.rateNote')}</Text>
          </View>
          <Switch checked={showJpy} color='#4caf50' onChange={(e) => setShowJpy(e.detail.value)} />
        </View>

        <View className='settings__row' onClick={refreshFxRate}>
          <View className='settings__row-body'>
            <Text className='settings__row-label'>
              1 CNY ≈ {getFxRate().toFixed(2)} JPY
            </Text>
            <Text className='settings__row-desc'>
              {getFxQuotedAt() ? new Date(getFxQuotedAt()).toLocaleString() : '—'}
            </Text>
          </View>
          <Text className='settings__row-action'>{t('common.retry')}</Text>
        </View>
      </View>

      {/* ---- クーポン ---- */}
      <View className='settings__card'>
        <Text className='settings__card-title'>{t('user.coupons')}</Text>
        {coupons.length === 0 ? (
          <Text className='settings__empty'>{t('common.empty')}</Text>
        ) : (
          coupons.map((coupon) => (
            <View key={coupon.id} className={`settings__coupon ${coupon.used ? 'is-used' : ''}`}>
              <View className='settings__coupon-value'>
                {coupon.type === 'percent' ? (
                  <Text className='settings__coupon-num'>{coupon.value}%</Text>
                ) : coupon.type === 'shipping' ? (
                  <Text className='settings__coupon-num'>🚚</Text>
                ) : (
                  <Text className='settings__coupon-num'>¥{formatCny(coupon.value)}</Text>
                )}
              </View>
              <View className='settings__coupon-body'>
                <Text className='settings__coupon-title'>{tx(coupon.title)}</Text>
                <Text className='settings__coupon-cond'>
                  ¥{formatCny(coupon.minAmountCny)} ~ ／ {coupon.expiresAt.slice(0, 10)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ---- 通知・その他 ---- */}
      <View className='settings__card'>
        <Text className='settings__card-title'>{t('user.notification')}</Text>

        <View className='settings__row'>
          <View className='settings__row-body'>
            <Text className='settings__row-label'>{t('user.notification')}</Text>
          </View>
          <Switch
            checked={notificationEnabled}
            color='#4caf50'
            onChange={() => Taro.openSetting()}
          />
        </View>

        <View
          className='settings__row'
          onClick={() => {
            clearCache()
            Taro.showToast({ title: 'OK', icon: 'success' })
          }}
        >
          <View className='settings__row-body'>
            <Text className='settings__row-label'>Cache</Text>
          </View>
          <Text className='settings__row-action'>›</Text>
        </View>
      </View>

      {isLoggedIn && (
        <View
          className='settings__signout'
          hoverClass='settings__signout--hover'
          onClick={() => {
            signOut()
            Taro.navigateBack()
          }}
        >
          <Text>{t('user.login')} ✕</Text>
        </View>
      )}
    </View>
  )
}
