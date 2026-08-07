import { adminApi } from '@/api/admin'
import { useAsync } from '@/hooks/useAsync'
import { formatCny } from '@/utils/format'

/**
 * ダッシュボード。
 *
 * 集計は /admin/overview に任せる。商品を全件取ってきて数えると、
 * 商品が増えたときに管理画面を開くだけで重くなる。
 */
export default function Dashboard() {
  const overview = useAsync(() => adminApi.overview(), [])

  if (overview.loading) return <div className='loading'>読み込み中…</div>

  if (overview.error) {
    return (
      <>
        <div className='error-banner'>{overview.error}</div>
        <button className='btn btn--ghost' onClick={overview.reload}>
          再試行
        </button>
      </>
    )
  }

  const data = overview.data!

  return (
    <>
      <div className='stat-grid'>
        <div className='stat'>
          <div className='stat__label'>本日の入金</div>
          <div className='stat__value'>{formatCny(data.today.paidAmountCny)}</div>
          <div className='stat__hint'>{data.today.paidOrders} 件</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>発送待ち</div>
          <div className='stat__value'>{data.orders.pendingShipment}</div>
          <div className='stat__hint'>入金済み・未出荷</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>未払い</div>
          <div className='stat__value'>{data.orders.pendingPayment}</div>
          <div className='stat__hint'>在庫を確保したまま滞留している</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>在庫僅少（20 以下）</div>
          <div className='stat__value'>{data.products.lowStock}</div>
          <div className='stat__hint'>期限切れロットは除外して計算</div>
        </div>
      </div>

      <div className='stat-grid' style={{ marginTop: 16 }}>
        <div className='stat'>
          <div className='stat__label'>公開中の商品</div>
          <div className='stat__value'>
            {data.products.active}
            <span className='muted' style={{ fontSize: 14 }}> / {data.products.total}</span>
          </div>
        </div>

        <div className='stat'>
          <div className='stat__label'>配送中</div>
          <div className='stat__value'>{data.orders.shipped}</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>完了</div>
          <div className='stat__value'>{data.orders.completed}</div>
        </div>

      </div>

    </>
  )
}
