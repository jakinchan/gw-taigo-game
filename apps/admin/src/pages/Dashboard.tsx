import { catalogApi, fxApi } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { formatCny, formatDateTime, tx } from '@/utils/format'

/** 在庫が少ない商品を拾う閾値 */
const LOW_STOCK = 20

export default function Dashboard() {
  const products = useAsync(() => catalogApi.products({ page: 1 }), [])
  const fx = useAsync(() => fxApi.rate(), [])

  if (products.loading) return <div className='loading'>読み込み中…</div>

  if (products.error) {
    return (
      <>
        <div className='error-banner'>{products.error}</div>
        <button className='btn btn--ghost' onClick={products.reload}>
          再試行
        </button>
      </>
    )
  }

  const list = products.data?.list ?? []
  const soldOut = list.filter((p) => p.stock <= 0)
  const lowStock = list.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK)
  const crossBorder = list.filter((p) => p.isCrossBorder)

  return (
    <>
      <div className='stat-grid'>
        <div className='stat'>
          <div className='stat__label'>商品数</div>
          <div className='stat__value'>{products.data?.total ?? 0}</div>
          <div className='stat__hint'>うち越境EC 対象 {crossBorder.length} 件</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>在庫僅少（{LOW_STOCK} 以下）</div>
          <div className='stat__value'>{lowStock.length}</div>
          <div className='stat__hint'>賞味期限の近いロットから引き当てられる</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>在庫切れ</div>
          <div className='stat__value'>{soldOut.length}</div>
          <div className='stat__hint'>販売継続なら補充が必要</div>
        </div>

        <div className='stat'>
          <div className='stat__label'>参考レート（1 CNY）</div>
          <div className='stat__value'>
            {fx.data ? `￥${fx.data.rate.toFixed(2)}` : '—'}
          </div>
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

      <div className='card'>
        <h2 className='card__title'>補充が必要な商品</h2>
        {[...soldOut, ...lowStock].length === 0 ? (
          <div className='empty'>在庫僅少・在庫切れの商品はありません</div>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>商品名</th>
                  <th>SKU</th>
                  <th className='num'>在庫</th>
                  <th className='num'>価格</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {[...soldOut, ...lowStock].map((p) => (
                  <tr key={p.id}>
                    <td className='wrap'>{tx(p.name)}</td>
                    <td className='muted'>{p.sku}</td>
                    <td className='num'>{p.stock}</td>
                    <td className='num'>{formatCny(p.priceCny)}</td>
                    <td>
                      {p.stock <= 0 ? (
                        <span className='badge badge--danger'>在庫切れ</span>
                      ) : (
                        <span className='badge badge--warn'>僅少</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
