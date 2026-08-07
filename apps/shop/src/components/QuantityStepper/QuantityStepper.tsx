import { View, Text, Input } from '@tarojs/components'

import './QuantityStepper.scss'

interface Props {
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

/**
 * 数量選択（− 1 ＋）。
 * 上限は在庫数。手入力も許すが、確定時に必ず min/max へクランプする。
 */
export default function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  size = 'md',
  disabled = false,
}: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(n, Math.max(max, min)))

  const canDecrease = !disabled && value > min
  const canIncrease = !disabled && value < max

  const handleInput = (raw: string) => {
    // 空文字や非数字は変更を確定させない（onBlur でクランプされる）
    const parsed = parseInt(raw.replace(/\D/g, ''), 10)
    if (Number.isNaN(parsed)) return
    onChange(clamp(parsed))
  }

  return (
    <View className={`stepper stepper--${size} ${disabled ? 'is-disabled' : ''}`}>
      <View
        className={`stepper__btn ${canDecrease ? '' : 'is-disabled'}`}
        hoverClass={canDecrease ? 'stepper__btn--hover' : 'none'}
        onClick={() => canDecrease && onChange(value - 1)}
        aria-role='button'
        aria-label='-'
      >
        <Text className='stepper__sign'>−</Text>
      </View>

      <Input
        className='stepper__input'
        type='number'
        value={String(value)}
        disabled={disabled}
        onInput={(e) => handleInput(e.detail.value)}
        onBlur={(e) => {
          const parsed = parseInt(e.detail.value, 10)
          onChange(Number.isNaN(parsed) ? min : clamp(parsed))
        }}
      />

      <View
        className={`stepper__btn ${canIncrease ? '' : 'is-disabled'}`}
        hoverClass={canIncrease ? 'stepper__btn--hover' : 'none'}
        onClick={() => canIncrease && onChange(value + 1)}
        aria-role='button'
        aria-label='+'
      >
        <Text className='stepper__sign'>＋</Text>
      </View>
    </View>
  )
}
