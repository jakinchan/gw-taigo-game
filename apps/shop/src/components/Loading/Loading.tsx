import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useI18n } from '@/services/i18n'

import './Loading.scss'

interface Props {
  /** ローディング中かどうか */
  loading: boolean
  /** 全画面に敷くか、インライン（リスト下端など）か */
  variant?: 'page' | 'inline'
  /** これを過ぎたらキャンセルボタンを出す（ms）。既定 5 秒。 */
  cancelAfterMs?: number
  onCancel?: () => void
}

/**
 * ローディング表示。
 *
 * 仕様どおりアニメーションは 1 種類（脈動する葉）だけに絞る。
 * 長時間待たされたときだけキャンセル導線を出し、それまでは
 * 余計な UI を見せない。
 */
export default function Loading({
  loading,
  variant = 'inline',
  cancelAfterMs = 5000,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const [showCancel, setShowCancel] = useState(false)

  useEffect(() => {
    if (!loading || !onCancel) {
      setShowCancel(false)
      return
    }
    const timer = setTimeout(() => setShowCancel(true), cancelAfterMs)
    return () => clearTimeout(timer)
  }, [loading, onCancel, cancelAfterMs])

  if (!loading) return null

  return (
    <View className={`loading loading--${variant}`}>
      <View className='loading__dots'>
        <View className='loading__dot' />
        <View className='loading__dot' />
        <View className='loading__dot' />
      </View>

      <Text className='loading__text'>
        {showCancel ? t('common.loadingLong') : t('common.loading')}
      </Text>

      {showCancel && onCancel && (
        <View className='loading__cancel' hoverClass='loading__cancel--hover' onClick={onCancel}>
          <Text>{t('common.cancel')}</Text>
        </View>
      )}
    </View>
  )
}
