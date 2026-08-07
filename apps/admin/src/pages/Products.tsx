import { useState } from 'react'
import { catalogApi } from '@/api'
import { adminApi } from '@/api/admin'
import { useAsync } from '@/hooks/useAsync'
import { formatCny, tx } from '@/utils/format'

export default function Products() {
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  /** 入力のたびに叩かないよう、確定した条件だけで取得する */
  const [applied, setApplied] = useState({ keyword: '', categoryId: '' })

  const categories = useAsync(() => catalogApi.categories(), [])
  const products = useAsync(
    () =>
      catalogApi.products({
        keyword: applied.keyword || undefined,
        categoryId: applied.categoryId || undefined,
      }),
    [applied],
  )

  const [error, setError] = useState<string | null>(null)

  const apply = () => setApplied({ keyword, categoryId })

  /**
   * 価格改定。分単位で扱うため、入力された元をそのまま送らない。
   * 「128.5 元」→ 12850 分に直してから送る。
   */
  const editPrice = async (id: string, current: number, name: string) => {
    const input = window.prompt(`${name} の販売価格（元）`, (current / 100).toFixed(2))
    if (input === null) return

    const yuan = Number(input)
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError('価格は 0 より大きい数値で入力してください')
      return
    }

    setError(null)
    try {
      await adminApi.updateProduct(id, { priceCny: Math.round(yuan * 100) })
      products.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** 公開状態の切り替え。非公開にすると商城の一覧から消える。 */
  const toggleActive = async (id: string, next: boolean) => {
    setError(null)
    try {
      await adminApi.updateProduct(id, { isActive: next })
      products.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className='toolbar'>
        <input
          className='input'
          placeholder='商品名・SKU で検索'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <select
          className='select'
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value=''>すべてのカテゴリ</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {tx(c.name)}
            </option>
          ))}
        </select>
        <button className='btn' onClick={apply}>
          検索
        </button>
        <button
          className='btn btn--ghost'
          onClick={() => {
            setKeyword('')
            setCategoryId('')
            setApplied({ keyword: '', categoryId: '' })
          }}
        >
          条件をクリア
        </button>
      </div>

      {(products.error || error) && (
        <div className='error-banner'>{products.error ?? error}</div>
      )}

      {products.loading ? (
        <div className='loading'>読み込み中…</div>
      ) : (products.data?.list.length ?? 0) === 0 ? (
        <div className='card'>
          <div className='empty'>該当する商品がありません</div>
        </div>
      ) : (
        <div className='table-wrap'>
          <table className='table'>
            <thead>
              <tr>
                <th>商品名</th>
                <th>SKU</th>
                <th className='num'>価格</th>
                <th className='num'>参考価格</th>
                <th className='num'>在庫</th>
                <th>区分</th>
                <th>原産国</th>
                <th>認可番号</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.data!.list.map((p) => (
                <tr key={p.id}>
                  <td className='wrap'>{tx(p.name)}</td>
                  <td className='muted'>{p.sku}</td>
                  <td className='num'>{formatCny(p.priceCny)}</td>
                  <td className='num muted'>
                    {p.originalPriceCny ? formatCny(p.originalPriceCny) : '—'}
                  </td>
                  <td className='num'>
                    {p.stock <= 0 ? (
                      <span className='badge badge--danger'>0</span>
                    ) : (
                      p.stock
                    )}
                  </td>
                  <td>
                    {p.isCrossBorder ? (
                      <span className='badge'>越境</span>
                    ) : (
                      <span className='badge badge--muted'>国内</span>
                    )}
                  </td>
                  <td>{p.originCountry}</td>
                  <td className='muted'>{p.approvalNumber ?? '一般食品'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button
                      className='btn btn--ghost'
                      onClick={() => editPrice(p.id, p.priceCny, tx(p.name))}
                    >
                      価格
                    </button>
                    <button className='btn btn--ghost' onClick={() => toggleActive(p.id, false)}>
                      非公開
                    </button>
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
