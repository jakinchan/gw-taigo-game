import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { Order, OrderStatus } from '@/types'
import { orderApi } from '@/services/api'
import { payOrder } from '@/services/wechatPay'
import { useI18n } from '@/services/i18n'
import { formatCny } from '@/utils/currency'
import { toUserMessage } from '@/utils/request'
import SafeImage from '@/components/SafeImage'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './list.scss'

/** 「すべて」を含むタブ定義。undefined = 全件。 */
const TABS: { status?: OrderStatus; labelKey: string }[] = [
  { status: undefined, labelKey: 'common.all' },
  { status: 'pending_payment', labelKey: 'user.orderPendingPayment' },
  { status: 'pending_shipment', labelKey: 'user.orderPendingShipment' },
  { status: 'shipped', labelKey: 'user.orderShipped' },
  { status: 'completed', labelKey: 'user.orderCompleted' },
]

/** 注文履歴。未払い注文はここから再決済できる。 */
export default function OrderList() {
  const router = useRouter()
  const { t, tx } = useI18n()

  const [status, setStatus] = useState<OrderStatus | undefined>(
    router.params.status as OrderStatus | undefined,
  )
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await orderApi.list(status)
      setOrders(result.list)
    } catch (err) {
      console.error('[order] load failed', err)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const rePay = async (order: Order) => {
    if (paying) return
    setPaying(order.id)
    try {
      const result = await payOrder(order)
      if (result.status === 'success') {
        Taro.showToast({ title: t('checkout.paySuccess'), icon: 'success' })
        await load()
      } else if (result.status === 'cancelled') {
        Taro.showToast({ title: t('checkout.payCancelled'), icon: 'none' })
      } else {
        Taro.showToast({ title: result.reason, icon: 'none' })
      }
    } finally {
      setPaying(null)
    }
  }

  const cancel = async (order: Order) => {
    const { confirm } = await Taro.showModal({
      title: t('common.confirm'),
      content: order.orderNo,
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    })
    if (!confirm) return

    try {
      await orderApi.cancel(order.id)
      await load()
    } catch (err) {
      Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
    }
  }

  const statusLabel = (value: OrderStatus): string => {
    const map: Record<OrderStatus, string> = {
      pending_payment: t('user.orderPendingPayment'),
      pending_shipment: t('user.orderPendingShipment'),
      shipped: t('user.orderShipped'),
      completed: t('user.orderCompleted'),
      cancelled: t('common.cancel'),
      refunding: t('common.loading'),
    }
    return map[value]
  }

  return (
    <View className='orders'>
      <ScrollView className='orders__tabs' scrollX showScrollbar={false}>
        <View className='orders__tabs-inner'>
          {TABS.map((tab) => (
            <View
              key={tab.labelKey}
              className={`orders__tab ${status === tab.status ? 'is-active' : ''}`}
              onClick={() => setStatus(tab.status)}
            >
              <Text>{t(tab.labelKey as 'common.all')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <Loading loading variant='inline' />
      ) : orders.length === 0 ? (
        <Empty
          text={t('common.empty')}
          icon='📋'
          actionText={t('cart.goShopping')}
          onAction={() => Taro.switchTab({ url: '/pages/index/index' })}
        />
      ) : (
        <View className='orders__list'>
          {orders.map((order) => (
            <View key={order.id} className='orders__card'>
              <View className='orders__card-head'>
                <Text className='orders__no'>{order.orderNo}</Text>
                <Text className={`orders__status orders__status--${order.status}`}>
                  {statusLabel(order.status)}
                </Text>
              </View>

              {order.items.map((item) => (
                <View key={item.productId} className='orders__item'>
                  <SafeImage
                    className='orders__item-thumb'
                    src={item.thumbnail} options={{ width: 64, height: 64 }}
                    mode='aspectFill'
                    lazyLoad
                  />
                  <View className='orders__item-info'>
                    <Text className='orders__item-name'>{tx(item.name)}</Text>
                    <Text className='orders__item-qty'>×{item.quantity}</Text>
                  </View>
                  <Text className='orders__item-price'>¥{formatCny(item.priceCny)}</Text>
                </View>
              ))}

              <View className='orders__card-foot'>
                <Text className='orders__total'>
                  {t('checkout.total')}{' '}
                  <Text className='orders__total-value'>
                    ¥{formatCny(order.amounts.totalCny)}
                  </Text>
                </Text>

                {order.status === 'pending_payment' && (
                  <View className='orders__actions'>
                    <View
                      className='orders__btn orders__btn--outline'
                      onClick={() => void cancel(order)}
                    >
                      <Text>{t('common.cancel')}</Text>
                    </View>
                    <View
                      className='orders__btn orders__btn--primary'
                      onClick={() => void rePay(order)}
                    >
                      <Text>
                        {paying === order.id ? t('checkout.submitting') : t('checkout.wechatPay')}
                      </Text>
                    </View>
                  </View>
                )}

                {order.trackingNo && (
                  <Text className='orders__tracking'>{order.trackingNo}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
