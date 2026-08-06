import { View, Text } from '@tarojs/components'
import { useI18n } from '@/services/i18n'
import { usePreferenceStore } from '@/store/preference'
import { cnyToJpy, formatJpy, splitCny, formatCny } from '@/utils/currency'

import './PriceTag.scss'

interface Props {
  /** 価格（CNY・分単位） */
  priceCny: number
  /** 取り消し線で表示する参考価格（分） */
  originalPriceCny?: number
  size?: 'sm' | 'md' | 'lg'
  /** JPY 換算の併記位置。'inline' は同じ行、'below' は次の行。 */
  jpyPosition?: 'inline' | 'below' | 'none'
}

/**
 * 価格表示。
 * 整数部を大きく、小数部を小さく描くのが中国 EC の慣習なので、
 * splitCny() で分けて描画している。
 */
export default function PriceTag({
  priceCny,
  originalPriceCny,
  size = 'md',
  jpyPosition = 'inline',
}: Props) {
  const { t } = useI18n()
  const showJpy = usePreferenceStore((s) => s.showJpy)
  const { integer, decimal } = splitCny(priceCny)

  const jpy =
    showJpy && jpyPosition !== 'none' ? `${t('common.approx')} ￥${formatJpy(cnyToJpy(priceCny))}` : null

  return (
    <View className={`price-tag price-tag--${size} ${jpyPosition === 'below' ? 'is-stacked' : ''}`}>
      <View className='price-tag__main'>
        <Text className='price-tag__symbol'>¥</Text>
        <Text className='price-tag__integer'>{integer}</Text>
        <Text className='price-tag__decimal'>.{decimal}</Text>

        {originalPriceCny != null && originalPriceCny > priceCny && (
          <Text className='price-tag__original'>¥{formatCny(originalPriceCny)}</Text>
        )}
      </View>

      {jpy && <Text className='price-tag__jpy'>{jpy}</Text>}
    </View>
  )
}
