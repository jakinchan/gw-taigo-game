import { View, Text } from '@tarojs/components'

import './Empty.scss'

interface Props {
  text: string
  icon?: string
  /** 行動導線（「去逛逛」など） */
  actionText?: string
  onAction?: () => void
}

/** 空状態。データ 0 件・検索ヒット 0 件・エラー後の代替表示に使う。 */
export default function Empty({ text, icon = '🌿', actionText, onAction }: Props) {
  return (
    <View className='empty'>
      <Text className='empty__icon'>{icon}</Text>
      <Text className='empty__text'>{text}</Text>
      {actionText && onAction && (
        <View className='empty__action' hoverClass='empty__action--hover' onClick={onAction}>
          <Text>{actionText}</Text>
        </View>
      )}
    </View>
  )
}
