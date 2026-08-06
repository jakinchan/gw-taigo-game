import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'

import './QuickEntries.scss'

export interface QuickEntry {
  key: string
  /** 枠付きアイコンとして描く絵文字 */
  icon: string
  labelKey: string
  url: string
  /** tabBar ページへは switchTab が必要 */
  isTab?: boolean
}

/**
 * 首页のクイック導線（5 つ）。
 * 白いカードの中にアイコンを等幅で並べ、間に縦の区切り線を入れる。
 */
const ENTRIES: QuickEntry[] = [
  { key: 'coupon', icon: '¥', labelKey: 'home.entryCoupon', url: '/pages/points/points?tab=coupon' },
  {
    key: 'crowdfunding',
    icon: '⬚',
    labelKey: 'home.entryCrowdfunding',
    url: '/pages/products/products',
    isTab: true,
  },
  { key: 'new', icon: 'NEW', labelKey: 'home.entryNewArrival', url: '/pages/newarrival/newarrival' },
  { key: 'lottery', icon: '🎁', labelKey: 'home.entryLottery', url: '/pages/lottery/lottery' },
  { key: 'consult', icon: '💬', labelKey: 'home.entryConsult', url: '/pages/consult/consult' },
]

export default function QuickEntries() {
  const { t } = useI18n()

  const go = (entry: QuickEntry) => {
    if (entry.isTab) {
      // 众筹专区は「全部商品」タブの中のセグメントなので、
      // 遷移先タブに開くべきセグメントをストレージで伝える
      Taro.setStorageSync('hfs:pendingZone', 'crowdfunding')
      Taro.switchTab({ url: entry.url })
      return
    }
    Taro.navigateTo({ url: entry.url })
  }

  return (
    <View className='quick-entries'>
      {ENTRIES.map((entry) => (
        <View
          key={entry.key}
          className='quick-entries__item'
          hoverClass='quick-entries__item--hover'
          onClick={() => go(entry)}
        >
          <View className='quick-entries__icon'>
            <Text className='quick-entries__icon-text'>{entry.icon}</Text>
          </View>
          <Text className='quick-entries__label'>
            {t(entry.labelKey as 'home.entryCoupon')}
          </Text>
        </View>
      ))}
    </View>
  )
}
