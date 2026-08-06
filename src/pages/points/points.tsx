import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { Coupon } from '@/types'
import { userApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { formatCny } from '@/utils/currency'
import ChipTabs, { type Chip } from '@/components/ChipTabs'
import Empty from '@/components/Empty'

import './points.scss'

type Tab = 'mall' | 'coupon' | 'checkin' | 'gift' | 'prize'

/** ポイントで交換できる会員クーポン。実運用ではサーバから取得する。 */
const EXCHANGEABLE = [
  { id: 'e10', points: 1000, valueCny: 1000 },
  { id: 'e20', points: 2000, valueCny: 2000 },
  { id: 'e30', points: 3000, valueCny: 3000 },
  { id: 'e40', points: 4000, valueCny: 4000 },
]

/** 签到有礼の 7 日サイクル */
const CHECKIN_DAYS = [1, 2, 3, 4, 5, 6, 7]

/**
 * 积分商城。マイページ・首页・抽選ページからの導線をまとめて受ける。
 * `?tab=` でどのタブを開くかを指定する。
 */
export default function Points() {
  const router = useRouter()
  const { t, tx } = useI18n()
  const profile = useUserStore((s) => s.profile)

  const [tab, setTab] = useState<Tab>((router.params.tab as Tab) ?? 'mall')
  const [coupons, setCoupons] = useState<Coupon[]>([])

  useEffect(() => {
    userApi
      .coupons()
      .then(setCoupons)
      .catch((err) => console.error('[points] coupons failed', err))
  }, [])

  const points = profile?.points ?? 0

  const chips: Chip[] = [
    { id: 'mall', label: t('points.tabMall') },
    { id: 'coupon', label: t('points.tabCoupon') },
    { id: 'checkin', label: t('points.tabCheckin') },
    { id: 'gift', label: t('points.tabGift') },
    { id: 'prize', label: t('points.tabPrize') },
  ]

  const exchange = (item: (typeof EXCHANGEABLE)[number]) => {
    if (points < item.points) {
      Taro.showToast({ title: t('lottery.notEnoughPoints'), icon: 'none' })
      return
    }
    // TODO: サーバの交換 API に接続する
    Taro.showToast({ title: t('points.exchange'), icon: 'success' })
  }

  return (
    <View className='points'>
      <View className='points__balance'>
        <Text className='points__balance-label'>{t('points.balance')}</Text>
        <Text className='points__balance-value'>{points}</Text>
      </View>

      <ChipTabs chips={chips} activeId={tab} onChange={(id) => setTab(id as Tab)} />

      {/* ---- 積分商城 / 赠品兑换 ---- */}
      {(tab === 'mall' || tab === 'gift') && (
        <View className='points__grid'>
          {EXCHANGEABLE.map((item) => (
            <View key={item.id} className='points__item'>
              <View className='points__item-value'>
                <Text className='points__item-amount'>¥{formatCny(item.valueCny)}</Text>
                <Text className='points__item-unit'>{t('user.memberCoupon')}</Text>
              </View>
              <Text className='points__item-cost'>{item.points} {t('user.points')}</Text>
              <View
                className={`points__item-btn ${points < item.points ? 'is-disabled' : ''}`}
                hoverClass={points < item.points ? 'none' : 'points__item-btn--hover'}
                onClick={() => exchange(item)}
              >
                <Text>{t('points.exchange')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ---- 保有クーポン / 当選景品 ---- */}
      {(tab === 'coupon' || tab === 'prize') && (
        <View className='points__coupons'>
          {coupons.length === 0 ? (
            <Empty text={t('common.empty')} icon='🎫' />
          ) : (
            coupons.map((coupon) => (
              <View key={coupon.id} className={`points__coupon ${coupon.used ? 'is-used' : ''}`}>
                <View className='points__coupon-left'>
                  <Text className='points__coupon-value'>
                    {coupon.type === 'percent'
                      ? `${coupon.value}%`
                      : coupon.type === 'shipping'
                        ? '🚚'
                        : `¥${formatCny(coupon.value)}`}
                  </Text>
                </View>
                <View className='points__coupon-body'>
                  <Text className='points__coupon-title'>{tx(coupon.title)}</Text>
                  <Text className='points__coupon-cond'>
                    ¥{formatCny(coupon.minAmountCny)} ~ ／ {coupon.expiresAt.slice(0, 10)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* ---- 签到有礼 ---- */}
      {tab === 'checkin' && (
        <View className='points__checkin'>
          <View className='points__checkin-days'>
            {CHECKIN_DAYS.map((day) => (
              <View key={day} className={`points__day ${day <= 1 ? 'is-done' : ''}`}>
                <Text className='points__day-icon'>🪙</Text>
                <Text className='points__day-label'>{day}</Text>
              </View>
            ))}
          </View>

          <View
            className='points__checkin-btn'
            hoverClass='points__checkin-btn--hover'
            onClick={() => Taro.showToast({ title: t('points.tabCheckin'), icon: 'success' })}
          >
            <Text>{t('points.tabCheckin')}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
