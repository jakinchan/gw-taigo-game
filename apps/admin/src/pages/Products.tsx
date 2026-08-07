import { useState } from 'react'
import { catalogApi } from '@/api'
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

  const apply = () => setApplied({ keyword, categoryId })

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

      <div className='notice'>
        現在は参照のみです。商品の登録・価格改定・在庫調整は、管理者権限付きの
        <code> /api/admin/products </code>
        を用意してから接続します（誰でも書ける状態にはできないため）。
      </div>

      {products.error && <div className='error-banner'>{products.error}</div>}

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
