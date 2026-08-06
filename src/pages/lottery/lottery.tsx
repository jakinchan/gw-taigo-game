import { useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'
import { useUserStore } from '@/store/user'

import './lottery.scss'

interface Prize {
  id: string
  label: string
  icon: string
}

/**
 * 3x3 のマス。中央（index 4）は抽選ボタンなので賞品を置かない。
 * 実運用では賞品と当選確率はサーバが持ち、抽選もサーバで行う。
 * クライアントは「どのマスで止めるか」をサーバの結果から逆算するだけ。
 */
const PRIZES: Prize[] = [
  { id: 'p50', label: '50 积分', icon: '🪙' },
  { id: 'free', label: '最近一单免单', icon: '🎫' },
  { id: 'c15', label: '15 元立减券', icon: '🧧' },
  { id: 'luck', label: '幸运值 +1', icon: '🍀' },
  { id: 'p20', label: '20 积分', icon: '🪙' },
  { id: 'fishoil', label: '鱼油一盒', icon: '💊' },
  { id: 'c12', label: '12 元满减券', icon: '🧧' },
  { id: 'kids', label: '儿童益生菌', icon: '🧴' },
]

/** マスを時計回りに巡る順序（中央の 4 を除く） */
const RING = [0, 1, 2, 5, 8, 7, 6, 3]

const COST_PER_DRAW = 100

/**
 * 幸运大抽奖。
 *
 * 演出は「リングを高速に回り、徐々に減速して当選マスで止まる」。
 * 当選結果はサーバが決めるべきもので、クライアントの乱数で決めてはいけない
 * （景品表示・不正防止の両面から）。ここでは API 未接続のため
 * ローカルで抽選しているが、drawFromServer() に差し替える前提の構造にしている。
 */
export default function Lottery() {
  const { t } = useI18n()
  const profile = useUserStore((s) => s.profile)

  const [highlight, setHighlight] = useState(-1)
  const [spinning, setSpinning] = useState(false)
  const [remaining, setRemaining] = useState(10)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const points = profile?.points ?? 0

  const spin = () => {
    if (spinning) return

    if (remaining <= 0) {
      Taro.showToast({ title: t('lottery.noChance'), icon: 'none' })
      return
    }
    if (points < COST_PER_DRAW) {
      Taro.showToast({ title: t('lottery.notEnoughPoints'), icon: 'none' })
      return
    }

    setSpinning(true)

    // TODO: サーバ抽選に差し替える（当選結果 → 停止位置を決める）
    const winningRingIndex = Math.floor(Math.random() * RING.length)
    // 3 周してから当選位置で止める
    const totalSteps = RING.length * 3 + winningRingIndex

    let step = 0
    const tick = () => {
      setHighlight(RING[step % RING.length])
      step += 1

      if (step > totalSteps) {
        setSpinning(false)
        setRemaining((n) => Math.max(n - 1, 0))
        const prize = PRIZES[RING[winningRingIndex] > 4 ? RING[winningRingIndex] - 1 : RING[winningRingIndex]]
        Taro.showModal({
          title: t('lottery.congrats'),
          content: prize.label,
          showCancel: false,
          confirmText: t('common.confirm'),
        })
        return
      }

      // 終盤ほど間隔を伸ばして減速させる
      const progress = step / totalSteps
      const delay = 60 + progress * progress * 260
      timerRef.current = setTimeout(tick, delay)
    }
    tick()
  }

  /** グリッドの 9 マス。中央だけ抽選ボタンに差し替える。 */
  const cells = Array.from({ length: 9 }, (_, i) => {
    if (i === 4) return null
    return PRIZES[i > 4 ? i - 1 : i]
  })

  return (
    <View className='lottery'>
      <View className='lottery__rules'>
        <Text>{t('lottery.rules')}</Text>
      </View>

      <View className='lottery__board'>
        <View className='lottery__grid'>
          {cells.map((prize, i) =>
            prize === null ? (
              <View
                key='draw'
                className={`lottery__cell lottery__cell--draw ${spinning ? 'is-spinning' : ''}`}
                hoverClass={spinning ? 'none' : 'lottery__cell--hover'}
                onClick={spin}
              >
                <Text className='lottery__draw-text'>{t('lottery.draw')}</Text>
                <Text className='lottery__draw-sub'>
                  {t('lottery.remaining', { count: remaining })}
                </Text>
              </View>
            ) : (
              <View
                key={prize.id}
                className={`lottery__cell ${highlight === i ? 'is-active' : ''}`}
              >
                <Text className='lottery__cell-icon'>{prize.icon}</Text>
                <Text className='lottery__cell-label'>{prize.label}</Text>
              </View>
            ),
          )}
        </View>

        <Text className='lottery__points'>
          {t('lottery.myPoints', { points, cost: COST_PER_DRAW })}
        </Text>
      </View>

      {/* ---- 抽選チャンスを増やすタスク ---- */}
      <View className='lottery__tasks'>
        <View className='lottery__tasks-head'>
          <Text>{t('lottery.taskTitle')}</Text>
        </View>

        <View className='lottery__task'>
          <View className='lottery__task-body'>
            <Text className='lottery__task-name'>{t('lottery.taskOrder')}</Text>
            <Text className='lottery__task-reward'>{t('lottery.taskReward')}</Text>
          </View>
          <View
            className='lottery__task-btn'
            hoverClass='lottery__task-btn--hover'
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
          >
            <Text>{t('lottery.goOrder')}</Text>
          </View>
        </View>
      </View>

      {/* 右端の「我的奖品」タブ */}
      <View
        className='lottery__prizes-tab'
        onClick={() => Taro.navigateTo({ url: '/pages/points/points?tab=prize' })}
      >
        <Text>{t('lottery.myPrizes')}</Text>
      </View>
    </View>
  )
}
