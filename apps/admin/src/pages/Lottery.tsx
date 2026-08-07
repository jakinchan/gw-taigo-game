import { lotteryApi } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { tx } from '@/utils/format'

const PRIZE_TYPE_LABEL: Record<string, string> = {
  points: '積分',
  coupon: 'クーポン',
  product: '現物',
  free_order: '注文無料',
  luck: '幸運値',
  none: 'ハズレ',
}

/** 抽選盤は 3x3。中央は抽選ボタンなので賞品を置かない。 */
const CENTER_SLOT = 4

export default function Lottery() {
  const board = useAsync(() => lotteryApi.board(), [])

  const prizes = board.data?.prizes ?? []
  const bySlot = new Map(prizes.map((p) => [p.slot, p]))

  return (
    <>
      {board.error && <div className='error-banner'>{board.error}</div>}

      <div className='notice'>
        当選確率（重み）と在庫はこの API では返していません。クライアントに渡すと
        確率を逆算できてしまうためで、抽選はサーバ側の 1 トランザクションで
        判定・積分消費・在庫減算まで完結します。確率の調整は DB の
        <code> LotteryPrize.weight </code>
        を直接編集してください（編集画面は未実装）。
      </div>

      {board.loading ? (
        <div className='loading'>読み込み中…</div>
      ) : (
        <>
          <div className='stat-grid'>
            <div className='stat'>
              <div className='stat__label'>賞品数</div>
              <div className='stat__value'>{prizes.length}</div>
              <div className='stat__hint'>中央のマスを除く 8 枠</div>
            </div>
            <div className='stat'>
              <div className='stat__label'>1 回あたりの消費積分</div>
              <div className='stat__value'>{board.data?.pointsPerDraw ?? '—'}</div>
            </div>
            <div className='stat'>
              <div className='stat__label'>1 日の上限回数</div>
              <div className='stat__value'>{board.data?.maxDrawsPerDay ?? '—'}</div>
            </div>
          </div>

          <div className='card' style={{ marginTop: 16 }}>
            <h2 className='card__title'>抽選盤の配置</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                maxWidth: 420,
              }}
            >
              {Array.from({ length: 9 }, (_, slot) => {
                if (slot === CENTER_SLOT) {
                  return (
                    <div
                      key='center'
                      style={{
                        padding: '18px 8px',
                        borderRadius: 8,
                        background: 'var(--primary)',
                        color: '#fff',
                        textAlign: 'center',
                        fontWeight: 700,
                      }}
                    >
                      抽選
                    </div>
                  )
                }
                const prize = bySlot.get(slot)
                return (
                  <div
                    key={slot}
                    style={{
                      padding: '12px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: '#fafbfc',
                      textAlign: 'center',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{prize ? tx(prize.name) : '（空き）'}</div>
                    {prize && (
                      <div className='muted' style={{ fontSize: 11 }}>
                        {PRIZE_TYPE_LABEL[prize.type] ?? prize.type}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
