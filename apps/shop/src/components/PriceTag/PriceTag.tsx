import { View, Text } from '@tarojs/components'
import { formatCny, splitCny } from '@/utils/currency'

import './PriceTag.scss'

interface Props {
  /** 価格（CNY・分単位） */
  priceCny: number
  /** 取り消し線で表示する参考価格（分） */
  originalPriceCny?: number
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 価格表示。人民元建て。
 * 整数部を大きく、小数部を小さく描くのが中国 EC の慣習なので、
 * splitCny() で分けて描画している。
 */
export default function PriceTag({ priceCny, originalPriceCny, size = 'md' }: Props) {
  const { integer, decimal } = splitCny(priceCny)

  return (
    <View className={`price-tag price-tag--${size}`}>
      <View className='price-tag__main'>
        <Text className='price-tag__symbol'>¥</Text>
        <Text className='price-tag__integer'>{integer}</Text>
        <Text className='price-tag__decimal'>.{decimal}</Text>

        {originalPriceCny != null && originalPriceCny > priceCny && (
          <Text className='price-tag__original'>¥{formatCny(originalPriceCny)}</Text>
        )}
      </View>
    </View>
  )
}
