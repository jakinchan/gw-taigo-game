import { catalogApi } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { tx } from '@/utils/format'

/** 越境EC 小売輸入の限度額（元） */
const SINGLE_LIMIT = 5000
const ANNUAL_LIMIT = 26000

export default function Compliance() {
  const products = useAsync(() => catalogApi.products({ page: 1 }), [])

  const list = products.data?.list ?? []
  const crossBorder = list.filter((p) => p.isCrossBorder)
  const missingApproval = crossBorder.filter((p) => !p.approvalNumber)

  return (
    <>
      <div className='stat-grid'>
        <div className='stat'>
          <div className='stat__label'>単回限度額</div>
          <div className='stat__value'>{SINGLE_LIMIT.toLocaleString()} 元</div>
          <div className='stat__hint'>超過分は注文を成立させない</div>
        </div>
        <div className='stat'>
          <div className='stat__label'>年間限度額</div>
          <div className='stat__value'>{ANNUAL_LIMIT.toLocaleString()} 元</div>
          <div className='stat__hint'>身分証単位で集計（アカウント単位ではない）</div>
        </div>
        <div className='stat'>
          <div className='stat__label'>越境EC 対象商品</div>
          <div className='stat__value'>{crossBorder.length}</div>
          <div className='stat__hint'>実名認証が購入の前提になる</div>
        </div>
      </div>

      <div className='notice' style={{ marginTop: 16 }}>
        <strong>綜合税率の考え方</strong>
        <br />
        実効税率 =（増値税率 + 消費税率）÷（1 − 消費税率）× 優遇係数（現行 70%）。
        健康食品は消費税 0% のため、増値税 13% なら 9.1% になります。
        税率は HS コード単位で管理し、適用した税率は注文明細に固定保存されるので、
        税制改正で過去の注文が動くことはありません。
      </div>

      {products.error && <div className='error-banner'>{products.error}</div>}

      <div className='card'>
        <h2 className='card__title'>保健食品の表示確認</h2>
        <p className='muted' style={{ marginTop: 0, fontSize: 12 }}>
          保健食品（「蓝帽子」）として訴求するには批准文号が必要です。
          番号が無い商品は一般食品としてのみ販売でき、疾病の予防・治療を
          示唆する表現は使えません。
        </p>

        {products.loading ? (
          <div className='loading'>読み込み中…</div>
        ) : missingApproval.length === 0 ? (
          <div className='empty'>批准文号の無い越境商品はありません</div>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>商品名</th>
                  <th>SKU</th>
                  <th>原産国</th>
                  <th>区分</th>
                </tr>
              </thead>
              <tbody>
                {missingApproval.map((p) => (
                  <tr key={p.id}>
                    <td className='wrap'>{tx(p.name)}</td>
                    <td className='muted'>{p.sku}</td>
                    <td>{p.originCountry}</td>
                    <td>
                      <span className='badge badge--warn'>一般食品として扱う</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className='card'>
        <h2 className='card__title'>未接続の項目</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
          <li>海关への申告送信（电子口岸の企業証明書が必要）</li>
          <li>HS コード別税率の編集（現在はシードで投入した 4 件）</li>
          <li>実名認証の照合（公安部の三要素認証との突合）</li>
        </ul>
      </div>
    </>
  )
}
