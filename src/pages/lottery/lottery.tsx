import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { lotteryApi, type DrawResult, type LotteryPrizeSlot } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { useUserStore } from '@/store/user'
import { toUserMessage } from '@/utils/request'
import Loading from '@/components/Loading'

import './lottery.scss'

/** 中央は抽選ボタンなので賞品を置かない */
const CENTER_SLOT = 4

/** マスを時計回りに巡る順序（中央を除く） */
const RING = [0, 1, 2, 5, 8, 7, 6, 3]

/** 賞品タイプごとの見た目 */
const PRIZE_ICON: Record<string, string> = {
  points: '🪙',
  coupon: '🧧',
  product: '💊',
  free_order: '🎫',
  luck: '🍀',
  none: '🙏',
}

/**
 * 幸运大抽奖。
 *
 * 当選判定はサーバが行う（backend/src/lottery）。クライアントは
 * 返ってきた slot まで演出を回して止めるだけで、結果には一切関与しない。
 * 景品に現物や免単が含まれるため、クライアント乱数では改ざんされる。
 */
export default function Lottery() {
  const { t, tx } = useI18n()
  const setProfilePoints = useUserStore((s) => s.setPoints)

  const [prizes, setPrizes] = useState<LotteryPrizeSlot[]>([])
  const [points, setPoints] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [pointsPerDraw, setPointsPerDraw] = useState(100)

  const [highlight, setHighlight] = useState(-1)
  const [spinning, setSpinning] = useState(false)
  const [loading, setLoading] = useState(true)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 再送時に同じ結果を返してもらうための冪等キー */
  const drawKeyRef = useRef<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const status = await lotteryApi.status()
      setPoints(status.points)
      setRemaining(status.remainingToday)
      setPointsPerDraw(status.pointsPerDraw)
    } catch (err) {
      console.error('[lottery] status failed', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([lotteryApi.board(), lotteryApi.status().catch(() => null)])
      .then(([board, status]) => {
        setPrizes(board.prizes)
        setPointsPerDraw(board.pointsPerDraw)
        if (status) {
          setPoints(status.points)
          setRemaining(status.remainingToday)
        }
      })
      .catch((err) => console.error('[lottery] board failed', err))
      .finally(() => setLoading(false))
  }, [])

  // 画面を離れるときにアニメーションのタイマーを止める
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  /** サーバの当選結果まで演出を回して止める */
  const runAnimation = (targetSlot: number, onDone: () => void) => {
    const targetRingIndex = RING.indexOf(targetSlot)
    // 賞品が RING 上に無い（データ不整合）場合は演出を省いて即確定する
    if (targetRingIndex < 0) {
      onDone()
      return
    }

    const totalSteps = RING.length * 3 + targetRingIndex
    let step = 0

    const tick = () => {
      setHighlight(RING[step % RING.length])
      step += 1

      if (step > totalSteps) {
        onDone()
        return
      }
      // 終盤ほど間隔を伸ばして減速させる
      const progress = step / totalSteps
      timerRef.current = setTimeout(tick, 60 + progress * progress * 260)
    }
    tick()
  }

  const spin = async () => {
    if (spinning) return

    if (remaining <= 0) {
      Taro.showToast({ title: t('lottery.noChance'), icon: 'none' })
      return
    }
    if (points < pointsPerDraw) {
      Taro.showToast({ title: t('lottery.notEnoughPoints'), icon: 'none' })
      return
    }

    setSpinning(true)

    // 同じ抽選の再送では同じキーを使い、二重に積分を引かれないようにする
    if (!drawKeyRef.current) {
      drawKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }

    let result: DrawResult
    try {
      result = await lotteryApi.draw(drawKeyRef.current)
    } catch (err) {
      console.error('[lottery] draw failed', err)
      setSpinning(false)
      // 失敗したキーは破棄して次回は新しい抽選にする
      drawKeyRef.current = null
      Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
      void loadStatus()
      return
    }

    runAnimation(result.slot, () => {
      setSpinning(false)
      setHighlight(result.slot)
      setPoints(result.pointsBalance)
      setRemaining(result.remainingToday)
      setProfilePoints(result.pointsBalance)
      drawKeyRef.current = null

      Taro.showModal({
        title: t('lottery.congrats'),
        content: tx(result.name),
        showCancel: false,
        confirmText: t('common.confirm'),
      })
    })
  }

  if (loading) return <Loading loading variant='page' />

  /** 9 マス。中央だけ抽選ボタンに差し替える。 */
  const cells = Array.from({ length: 9 }, (_, slot) =>
    slot === CENTER_SLOT ? null : (prizes.find((p) => p.slot === slot) ?? null),
  )

  return (
    <View className='lottery'>
      <View className='lottery__rules'>
        <Text>{t('lottery.rules')}</Text>
      </View>

      <View className='lottery__board'>
        <View className='lottery__grid'>
          {cells.map((prize, slot) =>
            slot === CENTER_SLOT ? (
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
                key={prize?.id ?? `empty-${slot}`}
                className={`lottery__cell ${highlight === slot ? 'is-active' : ''}`}
              >
                <Text className='lottery__cell-icon'>
                  {prize ? (PRIZE_ICON[prize.type] ?? '🎁') : ''}
                </Text>
                <Text className='lottery__cell-label'>{prize ? tx(prize.name) : ''}</Text>
              </View>
            ),
          )}
        </View>

        <Text className='lottery__points'>
          {t('lottery.myPoints', { points, cost: pointsPerDraw })}
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

      <View
        className='lottery__prizes-tab'
        onClick={() => Taro.navigateTo({ url: '/pages/points/points?tab=prize' })}
      >
        <Text>{t('lottery.myPrizes')}</Text>
      </View>
    </View>
  )
}
