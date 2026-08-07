import { useState } from 'react'
import type { Product } from '@hfs/shared'
import { catalogApi } from '@/api'
import { adminApi, type StockBatchRow } from '@/api/admin'
import { useAsync } from '@/hooks/useAsync'
import { formatCny, tx } from '@/utils/format'

/**
 * 在庫（ロット）管理。
 *
 * 商品を選ぶと、その商品のロットを FEFO 順（期限が近い順）で出す。
 * 注文はこの順で引き当てられるので、上にあるロットから出荷される。
 */
export default function Inventory() {
  const [selected, setSelected] = useState<Product | null>(null)
  const products = useAsync(() => catalogApi.products({ page: 1 }), [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
      <div className='card' style={{ margin: 0, maxHeight: '75vh', overflowY: 'auto' }}>
        <h2 className='card__title'>商品</h2>
        {products.loading ? (
          <div className='loading'>読み込み中…</div>
        ) : (
          (products.data?.list ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 4,
                border: '1px solid',
                borderColor: selected?.id === p.id ? 'var(--primary)' : 'transparent',
                borderRadius: 6,
                background: selected?.id === p.id ? 'var(--primary-bg)' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{tx(p.name)}</div>
              <div className='muted' style={{ fontSize: 11 }}>
                {p.sku} ・ 在庫 {p.stock} ・ {formatCny(p.priceCny)}
              </div>
            </button>
          ))
        )}
      </div>

      <div>
        {selected ? (
          <BatchPanel product={selected} />
        ) : (
          <div className='card'>
            <div className='empty'>左の一覧から商品を選んでください</div>
          </div>
        )}
      </div>
    </div>
  )
}

function BatchPanel({ product }: { product: Product }) {
  const batches = useAsync(() => adminApi.batches(product.id), [product.id])
  const [form, setForm] = useState({ batchNo: '', expiryDate: '', quantity: '', warehouse: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await adminApi.addBatch(product.id, {
        batchNo: form.batchNo.trim(),
        expiryDate: form.expiryDate,
        quantity: Number(form.quantity),
        warehouse: form.warehouse.trim() || undefined,
      })
      setForm({ batchNo: '', expiryDate: '', quantity: '', warehouse: '' })
      batches.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (batch: StockBatchRow) => {
    if (!window.confirm(`ロット ${batch.batchNo} を削除しますか？`)) return
    setError(null)
    try {
      await adminApi.removeBatch(batch.id)
      batches.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const rows = batches.data ?? []
  const totalAvailable = rows.reduce((sum, b) => (b.expired ? sum : sum + b.available), 0)

  return (
    <>
      <div className='card'>
        <h2 className='card__title'>
          {tx(product.name)} <span className='muted'>（{product.sku}）</span>
        </h2>
        <div className='muted' style={{ fontSize: 12, marginBottom: 12 }}>
          引き当て可能な在庫 <strong>{totalAvailable}</strong> 点。
          期限切れロットは出荷できないため合計に含めていません。
        </div>

        {error && <div className='error-banner'>{error}</div>}

        {batches.loading ? (
          <div className='loading'>読み込み中…</div>
        ) : rows.length === 0 ? (
          <div className='empty'>ロットが登録されていません</div>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>ロット番号</th>
                  <th>賞味期限</th>
                  <th className='num'>入庫数</th>
                  <th className='num'>確保済み</th>
                  <th className='num'>引き当て可能</th>
                  <th>倉庫</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.batchNo}</td>
                    <td>
                      {b.expiryDate}{' '}
                      {b.expired && <span className='badge badge--danger'>期限切れ</span>}
                    </td>
                    <td className='num'>{b.quantity}</td>
                    <td className='num'>{b.reserved}</td>
                    <td className='num'>
                      <strong>{b.available}</strong>
                    </td>
                    <td className='muted'>{b.warehouse ?? '—'}</td>
                    <td>
                      <button
                        className='btn btn--ghost'
                        onClick={() => remove(b)}
                        disabled={b.reserved > 0}
                        title={
                          b.reserved > 0
                            ? '未出荷の注文が確保しているため削除できません'
                            : undefined
                        }
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className='card' onSubmit={submit}>
        <h2 className='card__title'>ロットを追加（入庫）</h2>
        <div className='toolbar'>
          <input
            className='input'
            placeholder='ロット番号'
            value={form.batchNo}
            onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
            required
          />
          <input
            className='input'
            type='date'
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            required
          />
          <input
            className='input'
            type='number'
            min={1}
            placeholder='数量'
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
          />
          <input
            className='input'
            placeholder='倉庫コード（任意）'
            value={form.warehouse}
            onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
          />
          <button className='btn' type='submit' disabled={busy}>
            {busy ? '登録中…' : '追加'}
          </button>
        </div>
        <div className='muted' style={{ fontSize: 11 }}>
          賞味期限が近いロットから順に引き当てられます（FEFO）。
          過去の日付は登録できません。
        </div>
      </form>
    </>
  )
}
