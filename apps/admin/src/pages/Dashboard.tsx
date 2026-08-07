import { fxApi } from '@/api'
import { adminApi } from '@/api/admin'
import { useAsync } from '@/hooks/useAsync'
import { formatCny, formatDateTime } from '@/utils/format'

/**
 * ダッシュボード。
 *
 * 集計は /admin/overview に任せる。商品を全件取ってきて数えると、
 * 商品が増えたときに管理画面を開くだけで重くなる。
 */
export default function Dashboard() {
  const overview = useAsync(() => adminApi.overview(), [])
  const fx = useAsync(() => fxApi.rate(), [])

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

        <div className='stat'>
          <div className='stat__label'>参考レート（1 CNY）</div>
          <div className='stat__value'>{fx.data ? `￥${fx.data.rate.toFixed(2)}` : '—'}</div>
          <div className='stat__hint'>
            {fx.data ? formatDateTime(fx.data.quotedAt) : '取得できていません'}・表示専用
          </div>
        </div>
      </div>

      <div className='notice' style={{ marginTop: 16 }}>
        表示している為替レートは参考値です。越境決済では顧客が人民元で支払い、
        加盟店には契約通貨で入金されます。換算は微信支付／決済代行が精算時に確定させるため、
        この値を請求額や入金予定額として使わないでください。
      </div>
    </>
  )
}
