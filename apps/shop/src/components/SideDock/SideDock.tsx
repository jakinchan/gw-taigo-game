import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'

import './SideDock.scss'

interface DockItem {
  key: string
  labelKey: string
  url: string
}

/**
 * 画面右端に縦に並ぶフローティングボタン。
 * 実機では商品グリッドに重なる位置に固定表示され、
 * 主要キャンペーンへの常時導線になっている。
 */
const ITEMS: DockItem[] = [
  { key: 'checkin', labelKey: 'home.sideCheckin', url: '/pages/points/points?tab=checkin' },
  { key: 'instock', labelKey: 'home.sideInStock', url: '/pages/search/search?keyword=现货' },
  { key: 'skin', labelKey: 'home.sideSkin', url: '/pages/search/search?keyword=护肤' },
  { key: 'overseas', labelKey: 'home.sideOverseas', url: '/pages/search/search?keyword=海外' },
]

export default function SideDock() {
  const { t } = useI18n()

  return (
    <View className='side-dock'>
      {ITEMS.map((item) => (
        <View
          key={item.key}
          className='side-dock__item'
          hoverClass='side-dock__item--hover'
          onClick={() => Taro.navigateTo({ url: item.url })}
        >
          <Text className='side-dock__label'>{t(item.labelKey as 'home.sideCheckin')}</Text>
        </View>
      ))}
    </View>
  )
}
