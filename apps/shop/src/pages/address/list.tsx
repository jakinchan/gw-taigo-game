import { useCallback, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { Address } from '@/types'
import { userApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { toUserMessage } from '@/utils/request'
import Loading from '@/components/Loading'
import Empty from '@/components/Empty'

import './list.scss'

/**
 * 住所一覧。
 * `?select=1` で開かれた場合は「選択して戻る」モードになり、
 * checkout ページが選択結果を拾う。
 */
export default function AddressList() {
  const router = useRouter()
  const selectMode = router.params.select === '1'
  const { t } = useI18n()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setAddresses(await userApi.addresses())
    } catch (err) {
      console.error('[address] load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 編集ページから戻ってきたときに最新化する
  useDidShow(() => {
    void load()
  })

  const pick = (address: Address) => {
    if (!selectMode) return
    Taro.setStorageSync('hfs:selectedAddressId', address.id)
    Taro.navigateBack()
  }

  const remove = async (address: Address) => {
    const { confirm } = await Taro.showModal({
      title: t('cart.delete'),
      content: `${address.receiverName} ${address.detail}`,
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      confirmColor: '#e53935',
    })
    if (!confirm) return

    try {
      await userApi.deleteAddress(address.id)
      await load()
    } catch (err) {
      Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
    }
  }

  return (
    <View className='addr-list'>
      {loading ? (
        <Loading loading variant='inline' />
      ) : addresses.length === 0 ? (
        <Empty
          text={t('checkout.selectAddress')}
          icon='📍'
          actionText={t('checkout.addAddress')}
          onAction={() => Taro.navigateTo({ url: '/pages/address/edit' })}
        />
      ) : (
        <View className='addr-list__items'>
          {addresses.map((address) => (
            <View
              key={address.id}
              className='addr-list__item'
              hoverClass={selectMode ? 'addr-list__item--hover' : 'none'}
              onClick={() => pick(address)}
            >
              <View className='addr-list__head'>
                <Text className='addr-list__name'>{address.receiverName}</Text>
                <Text className='addr-list__phone'>{address.phone}</Text>
                {address.isDefault && <Text className='addr-list__tag'>默认</Text>}
              </View>

              <Text className='addr-list__detail'>
                {address.province}
                {address.city}
                {address.district} {address.detail}
              </Text>

              {address.idCardMasked && (
                <Text className='addr-list__idcard'>ID: {address.idCardMasked}</Text>
              )}

              <View className='addr-list__actions'>
                <Text
                  className='addr-list__action'
                  onClick={(e) => {
                    e.stopPropagation()
                    Taro.navigateTo({ url: `/pages/address/edit?id=${address.id}` })
                  }}
                >
                  ✏️
                </Text>
                <Text
                  className='addr-list__action'
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(address)
                  }}
                >
                  🗑
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className='addr-list__footer-space' />
      <View className='addr-list__footer'>
        <View
          className='addr-list__add'
          hoverClass='addr-list__add--hover'
          onClick={() => Taro.navigateTo({ url: '/pages/address/edit' })}
        >
          <Text>＋ {t('checkout.addAddress')}</Text>
        </View>
      </View>
    </View>
  )
}
