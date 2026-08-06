import { ScrollView, View, Text } from '@tarojs/components'

import './ChipTabs.scss'

export interface Chip {
  id: string
  label: string
}

interface Props {
  chips: Chip[]
  activeId: string
  onChange: (id: string) => void
}

/**
 * 横スクロールするチップ型タブ（畅销单品 / 基础 / 睡眠 / 肥胖 …）。
 * 選択中は青の塗り、非選択は薄いグレーの塗り。
 */
export default function ChipTabs({ chips, activeId, onChange }: Props) {
  return (
    <ScrollView className='chip-tabs' scrollX showScrollbar={false} enableFlex>
      <View className='chip-tabs__inner'>
        {chips.map((chip) => (
          <View
            key={chip.id}
            className={`chip-tabs__chip ${chip.id === activeId ? 'is-active' : ''}`}
            hoverClass='chip-tabs__chip--hover'
            onClick={() => onChange(chip.id)}
          >
            <Text>{chip.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
