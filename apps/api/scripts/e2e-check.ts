/**
 * 業務ロジックの通し検証。
 *
 *   npx ts-node scripts/e2e-check.ts
 *
 * API サーバと DB が起動している前提で、実際の HTTP 経由で
 * 「注文プレビュー → 実名認証 → 購入限度額 → 注文作成 → FEFO 引き当て → 抽選」
 * を確認する。微信ログインは通せないので、テスト用ユーザーを直接作って
 * 同じ JWT_SECRET でトークンを署名する（本番の認証経路は変更しない）。
 *
 * 冪等: 実行のたびにテストユーザーのデータを作り直す。
 */
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as jwt from 'jsonwebtoken'

// NestJS 経由ではないので .env を自前で読む
loadEnv()

const prisma = new PrismaClient()
/**
 * localhost だと Node の fetch が IPv6 (::1) を先に引いて
 * ECONNREFUSED になることがあるので、既定は IPv4 を明示する。
 */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3100/api'

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${label}`)
    if (detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 400)}`)
  }
}

interface ApiResult<T> {
  status: number
  body: { code: number; message: string; data: T }
}

async function api<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let body: ApiResult<T>['body']
  try {
    body = JSON.parse(text) as ApiResult<T>['body']
  } catch {
    body = { code: -1, message: text.slice(0, 200), data: null as T }
  }
  return { status: res.status, body }
}

/** チェックディジット込みの有効な身分証番号を組み立てる */
function makeIdCard(first17: string): string {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkChars = '10X98765432'
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * weights[i]
  return first17 + checkChars[sum % 11]
}

async function main() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set (run via `npm run e2e` so .env is loaded)')

  const openId = 'e2e-test-openid'
  const testOpenIds = [openId, 'e2e-other-openid']

  /**
   * テストユーザーを作り直す。
   * Order は財務記録なのでユーザー削除でカスケードさせない設計にしている。
   * 前回の実行が途中で落ちた場合に備え、依存の深い順に自分で消す。
   */
  const cleanup = async () => {
    const ids = (
      await prisma.user.findMany({ where: { openId: { in: testOpenIds } }, select: { id: true } })
    ).map((u) => u.id)
    if (ids.length === 0) return
    await prisma.order.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  }

  await cleanup()

  const user = await prisma.user.create({
    data: { openId, nickname: 'E2E テスト', points: 500 },
  })
  const token = jwt.sign({ sub: user.id, openId }, secret, { expiresIn: '1h' })

  console.log('\n=== 1. 認証 ===')
  const me = await api<{ id: string; points: number }>('/users/me', { token })
  check('JWT でプロフィールを取得できる', me.status === 200 && me.body.data?.id === user.id, me.body)
  const noAuth = await api('/users/me')
  check('トークン無しは 401', noAuth.status === 401)

  console.log('\n=== 2. 住所 ===')
  const addr = await api<{ id: string; phone: string }>('/users/me/addresses', {
    method: 'POST',
    token,
    body: {
      receiverName: '张三',
      phone: '13800138000',
      province: '上海市',
      city: '上海市',
      district: '浦东新区',
      detail: '张江路 123 号',
      isDefault: true,
    },
  })
  check('住所を作成できる', addr.status === 201 || addr.status === 200, addr.body)
  check('電話番号がマスクされて返る', addr.body.data?.phone === '138****8000', addr.body.data?.phone)

  const badPhone = await api('/users/me/addresses', {
    method: 'POST',
    token,
    body: { receiverName: 'x', phone: '090-1234-5678', province: 'a', city: 'b', district: 'c', detail: 'd' },
  })
  check('中国以外の電話番号形式は 400 で弾く', badPhone.status === 400)

  const addressId = addr.body.data.id

  console.log('\n=== 3. 注文プレビュー（税率・送料） ===')
  const product = await prisma.product.findFirstOrThrow({ where: { sku: 'HF-MVM-060' } })

  const preview = await api<{
    amounts: {
      subtotalCny: number
      shippingFeeCny: number
      taxCny: number
      totalCny: number
    }
    crossBorderLimit: { allowed: boolean; reason: string | null; remainingCny: number } | null
  }>('/orders/preview', {
    method: 'POST',
    token,
    body: { items: [{ productId: product.id, quantity: 1 }], addressId, shippingMethod: 'standard' },
  })

  const a = preview.body.data?.amounts
  check('プレビューが返る', preview.status === 200 || preview.status === 201, preview.body)
  check(`小計が DB の価格と一致 (${a?.subtotalCny} = ${product.priceCny})`, a?.subtotalCny === product.priceCny)
  // 12800 分 < 無料閾値 19900 分 なので送料 1000 分
  check(`送料が閾値未満で 1000 分 (${a?.shippingFeeCny})`, a?.shippingFeeCny === 1000)
  // HS 2106909090 → 増値税 13% / 消費税 0% / 優遇 70% = 9.1%
  const expectedTax = Math.round(product.priceCny * 0.091)
  check(`綜合税が HS コード税率で計算される (${a?.taxCny} = ${expectedTax})`, a?.taxCny === expectedTax)
  check(
    `合計 = 小計 + 送料 + 税 (${a?.totalCny})`,
    a?.totalCny === a!.subtotalCny + a!.shippingFeeCny + a!.taxCny,
  )

  console.log('\n=== 4. 実名認証が未済だと越境商品を買えない ===')
  check(
    '未認証はプレビューで allowed=false / reason=not_verified',
    preview.body.data?.crossBorderLimit?.allowed === false &&
      preview.body.data?.crossBorderLimit?.reason === 'not_verified',
    preview.body.data?.crossBorderLimit,
  )
  const blocked = await api('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: product.id, quantity: 1 }], addressId, shippingMethod: 'standard' },
  })
  check('未認証での注文作成は 400 で拒否', blocked.status === 400, blocked.body)

  console.log('\n=== 5. 実名認証 ===')
  const badId = await api('/users/me/real-name', {
    method: 'POST',
    token,
    body: { realName: '张三', idCard: '110101199003071234' },
  })
  check('チェックディジット不正の身分証は 400', badId.status === 400, badId.body)

  const validId = makeIdCard('11010119900307123')
  const rn = await api<{ realNameVerified: boolean; idCardMasked: string }>('/users/me/real-name', {
    method: 'POST',
    token,
    body: { realName: '张三', idCard: validId },
  })
  check('正しい身分証で認証できる', rn.body.data?.realNameVerified === true, rn.body)
  check(
    `身分証がマスクされて返る (${rn.body.data?.idCardMasked})`,
    rn.body.data?.idCardMasked === `110101********${validId.slice(-4)}`,
  )

  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  check('身分証が平文で保存されていない', !stored.idCardEncrypted?.includes(validId))
  check('暗号文が v1 形式', stored.idCardEncrypted?.startsWith('v1:') === true)
  check('名寄せ用ハッシュが保存される', typeof stored.idCardHash === 'string' && stored.idCardHash.length === 64)

  console.log('\n=== 6. 注文作成と FEFO 在庫引き当て ===')
  const batchesBefore = await prisma.stockBatch.findMany({
    where: { productId: product.id },
    orderBy: { expiryDate: 'asc' },
  })

  const order = await api<{ id: string; orderNo: string; amounts: { totalCny: number } }>('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: product.id, quantity: 3 }], addressId, shippingMethod: 'standard' },
  })
  check('認証後は注文を作成できる', order.status === 201 || order.status === 200, order.body)
  check(`注文番号が HF+日時+乱数の形式 (${order.body.data?.orderNo})`, /^HF\d{14}[A-Z2-9]{4}$/.test(order.body.data?.orderNo ?? ''))

  const batchesAfter = await prisma.stockBatch.findMany({
    where: { productId: product.id },
    orderBy: { expiryDate: 'asc' },
  })
  check(
    `期限が近いロットから確保される (${batchesBefore[0].batchNo}: reserved ${batchesBefore[0].reserved} → ${batchesAfter[0].reserved})`,
    batchesAfter[0].reserved === batchesBefore[0].reserved + 3,
  )
  check(
    '期限が遠いロットは手つかず',
    batchesAfter[1].reserved === batchesBefore[1].reserved,
  )

  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.body.data.id },
    include: { items: true },
  })
  check('申告名義人の身分証ハッシュが注文に固定保存される', savedOrder.declarantIdHash === stored.idCardHash)
  check(`明細に適用税率が固定保存される (${savedOrder.items[0].appliedTaxRate})`, savedOrder.items[0].appliedTaxRate === 0.091)
  check('明細に引き当てロットが残る', savedOrder.items[0].batchNo === batchesBefore[0].batchNo)

  console.log('\n=== 7. 購入限度額（単回 5,000 元） ===')
  const expensive = await prisma.product.findFirstOrThrow({ where: { sku: 'HF-COL-500' } })
  const overSingle = await api<{ message: string }>('/orders', {
    method: 'POST',
    token,
    // 298.00 元 x 20 = 5,960 元 > 5,000 元
    body: { items: [{ productId: expensive.id, quantity: 20 }], addressId, shippingMethod: 'standard' },
  })
  check('単回限度額 5,000 元 を超えると拒否', overSingle.status === 400, overSingle.body)
  check(
    '拒否理由が SINGLE_LIMIT_EXCEEDED',
    JSON.stringify(overSingle.body).includes('SINGLE_LIMIT_EXCEEDED'),
    overSingle.body,
  )

  console.log('\n=== 7b. 購入限度額（年間 26,000 元） ===')
  /**
   * 支払い済み注文を直接作って年間枠を埋める。
   * 決済は微信支付を通せないので、限度額の集計対象になる状態
   * （paid かつ pending_shipment 以降）を DB に用意して確認する。
   */
  const filler = await prisma.order.create({
    data: {
      orderNo: `HF-E2E-${Date.now()}`,
      userId: user.id,
      status: 'pending_shipment',
      addressId,
      addressSnapshot: {},
      // 商品実付金額 25,800 元 → 年間枠 26,000 元の残り 200 元
      subtotalCny: 2_580_000,
      discountCny: 0,
      totalCny: 2_580_000,
      declarantIdHash: stored.idCardHash,
      paidAt: new Date(),
    },
  })

  const quota = await api<{ usedCny: number; remainingCny: number }>(
    '/users/me/cross-border-quota',
    { token },
  )
  check(`使用済み額が集計される (${quota.body.data?.usedCny} 分)`, quota.body.data?.usedCny === 2_580_000)
  check(`残枠が 200 元 (${quota.body.data?.remainingCny} 分)`, quota.body.data?.remainingCny === 20_000)

  // 298.00 元 = 29,800 分 > 残枠 20,000 分
  const overAnnual = await api('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: expensive.id, quantity: 1 }], addressId, shippingMethod: 'standard' },
  })
  check('年間残枠を超えると拒否', overAnnual.status === 400, overAnnual.body)
  check(
    '拒否理由が ANNUAL_LIMIT_EXCEEDED',
    JSON.stringify(overAnnual.body).includes('ANNUAL_LIMIT_EXCEEDED'),
    overAnnual.body,
  )

  await prisma.order.delete({ where: { id: filler.id } })

  console.log('\n=== 8. 注文キャンセルで在庫が戻る ===')
  const cancelled = await api(`/orders/${order.body.data.id}/cancel`, { method: 'POST', token })
  check('未払い注文をキャンセルできる', cancelled.status === 200 || cancelled.status === 201, cancelled.body)
  const batchesAfterCancel = await prisma.stockBatch.findFirstOrThrow({
    where: { productId: product.id, batchNo: batchesBefore[0].batchNo },
  })
  check(
    `確保していた在庫が戻る (reserved ${batchesAfter[0].reserved} → ${batchesAfterCancel.reserved})`,
    batchesAfterCancel.reserved === batchesBefore[0].reserved,
  )

  console.log('\n=== 9. 他人の注文は読めない ===')
  const other = await prisma.user.upsert({
    where: { openId: 'e2e-other-openid' },
    update: {},
    create: { openId: 'e2e-other-openid', nickname: '別人' },
  })
  const otherToken = jwt.sign({ sub: other.id, openId: other.openId }, secret, { expiresIn: '1h' })
  const peek = await api(`/orders/${order.body.data.id}`, { token: otherToken })
  check('別ユーザーの注文 ID を直接叩くと 404', peek.status === 404, peek.body)

  console.log('\n=== 10. クーポン ===')
  const coupon = await api<{ discountCny: number }>('/coupons/validate', {
    method: 'POST',
    token,
    body: { code: 'WELCOME30', subtotalCny: 12800 },
  })
  check(`WELCOME30 が 30 元引き (${coupon.body.data?.discountCny})`, coupon.body.data?.discountCny === 3000)

  const belowMin = await api('/coupons/validate', {
    method: 'POST',
    token,
    body: { code: 'WELCOME30', subtotalCny: 5000 },
  })
  check('下限金額未満は 400', belowMin.status === 400, belowMin.body)

  console.log('\n=== 11. 抽選（サーバ抽選・冪等） ===')
  const board = await api<{ prizes: unknown[] }>('/lottery/board')
  check('賞品 8 件が返る', board.body.data?.prizes?.length === 8)
  check(
    '当選確率と在庫は返さない',
    !JSON.stringify(board.body.data).includes('weight') && !JSON.stringify(board.body.data).includes('stock'),
  )

  const key = `e2e-${Date.now()}`
  const draw1 = await api<{ prizeId: string; pointsBalance: number }>('/lottery/draw', {
    method: 'POST',
    token,
    body: { idempotencyKey: key },
  })
  check('抽選できる', draw1.status === 200 || draw1.status === 201, draw1.body)
  /**
   * 100 消費した上で、当選賞品が積分なら加算される。
   * 賞品は毎回変わるので「500 未満（＝確実に消費されている）」で見る。
   */
  check(
    `積分が消費される (500 → ${draw1.body.data?.pointsBalance})`,
    typeof draw1.body.data?.pointsBalance === 'number' && draw1.body.data.pointsBalance < 500,
  )

  const draw2 = await api<{ prizeId: string; pointsBalance: number }>('/lottery/draw', {
    method: 'POST',
    token,
    body: { idempotencyKey: key },
  })
  check('同じ冪等キーでは同じ結果', draw2.body.data?.prizeId === draw1.body.data?.prizeId)
  check(
    '同じ冪等キーで二重に積分を引かない',
    draw2.body.data?.pointsBalance === draw1.body.data?.pointsBalance,
    { first: draw1.body.data?.pointsBalance, second: draw2.body.data?.pointsBalance },
  )

  await cleanup()

  console.log(`\n${'='.repeat(50)}`)
  console.log(`成功 ${passed} / 失敗 ${failed}`)
  console.log('='.repeat(50))
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('\n実行時エラー:', err)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
