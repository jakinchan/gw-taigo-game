import { useState } from 'react'
import type { OrderStatus } from '@hfs/shared'
import { orderApi } from '@/api'
import { adminApi } from '@/api/admin'
import { useAsync } from '@/hooks/useAsync'
import { formatCny, formatDateTime, tx } from '@/utils/format'

const STATUS_TABS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'pending_payment', label: '未払い' },
  { value: 'pending_shipment', label: '発送待ち' },
  { value: 'shipped', label: '配送中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: 'キャンセル' },
  { value: 'refunding', label: '返金中' },
]

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending_payment: 'badge--warn',
  pending_shipment: 'badge',
  shipped: 'badge',
  completed: 'badge--ok',
  cancelled: 'badge--muted',
  refunding: 'badge--danger',
}

export default function Orders() {
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [error, setError] = useState<string | null>(null)
  const orders = useAsync(
    () => orderApi.list({ status: status || undefined }),
    [status],
  )

  /**
   * 出荷登録。発送待ちの注文にだけ出す。
   * 未払いの注文を出荷できると、代金を受け取らずに商品が出ていく。
   */
  const ship = async (orderId: string, orderNo: string) => {
    const trackingNo = window.prompt(`${orderNo} の追跡番号を入力してください`)
    if (!trackingNo?.trim()) return

    setError(null)
    try {
      await adminApi.shipOrder(orderId, trackingNo.trim())
      orders.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className='toolbar'>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            className={`btn ${status === tab.value ? '' : 'btn--ghost'}`}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(orders.error || error) && (
        <div className='error-banner'>{orders.error ?? error}</div>
      )}

      {orders.loading ? (
        <div className='loading'>読み込み中…</div>
      ) : (orders.data?.list.length ?? 0) === 0 ? (
        <div className='card'>
          <div className='empty'>該当する注文がありません</div>
        </div>
      ) : (
        <div className='table-wrap'>
          <table className='table'>
            <thead>
              <tr>
                <th>注文番号</th>
                <th>状態</th>
                <th className='wrap'>商品</th>
                <th className='num'>小計</th>
                <th className='num'>送料</th>
                <th className='num'>税</th>
                <th className='num'>合計</th>
                <th>注文日時</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.data!.list.map((order) => (
                <tr key={order.id}>
                  <td className='muted'>{order.orderNo}</td>
                  <td>
                    <span className={`badge ${STATUS_STYLE[order.status]}`}>
                      {STATUS_TABS.find((t) => t.value === order.status)?.label ?? order.status}
                    </span>
                  </td>
                  <td className='wrap'>
                    {order.items.map((i) => `${tx(i.name)} ×${i.quantity}`).join(' / ')}
                  </td>
                  <td className='num'>{formatCny(order.amounts.subtotalCny)}</td>
                  <td className='num'>{formatCny(order.amounts.shippingFeeCny)}</td>
                  <td className='num'>{formatCny(order.amounts.taxCny)}</td>
                  <td className='num'>
                    <strong>{formatCny(order.amounts.totalCny)}</strong>
                  </td>
                  <td className='muted'>{formatDateTime(order.createdAt)}</td>
                  <td>
                    {order.status === 'pending_shipment' ? (
                      <button className='btn' onClick={() => ship(order.id, order.orderNo)}>
                        出荷登録
                      </button>
                    ) : order.trackingNo ? (
                      <span className='muted'>{order.trackingNo}</span>
                    ) : (
                      <span className='muted'>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
