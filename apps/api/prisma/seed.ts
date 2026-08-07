/**
 * 開発用シードデータ。
 *
 *   npm run seed
 *
 * 本番環境では絶対に実行しないこと（NODE_ENV=production ならガードで止まる）。
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES = [
  { key: 'supplement', zh: '营养补充剂', ja: '栄養補助食品', en: 'Supplements' },
  { key: 'organic', zh: '有机食品', ja: 'オーガニック食品', en: 'Organic' },
  { key: 'drink', zh: '健康饮品', ja: '健康ドリンク', en: 'Health drinks' },
  { key: 'beauty', zh: '美容养颜', ja: '美容・エイジングケア', en: 'Beauty & aging care' },
  { key: 'weight', zh: '体重管理', ja: '体重管理', en: 'Weight management' },
  { key: 'kids', zh: '儿童营养', ja: 'こども向け栄養', en: 'Kids nutrition' },
]

const PRODUCTS = [
  {
    sku: 'HF-MVM-060',
    categoryKey: 'supplement',
    zh: '复合维生素矿物质胶囊 60 粒',
    ja: 'マルチビタミン＆ミネラル 60粒',
    en: 'Multivitamin & Mineral, 60 capsules',
    priceCny: 12800,
    originalPriceCny: 16800,
    isOnSale: true,
  },
  {
    sku: 'HF-OMG-090',
    categoryKey: 'supplement',
    zh: '深海鱼油 Omega-3 90 粒',
    ja: 'DHA・EPA オメガ3 90粒',
    en: 'Deep-Sea Fish Oil Omega-3, 90 softgels',
    priceCny: 19800,
    originalPriceCny: 24800,
    isNew: true,
  },
  {
    sku: 'HF-AOJ-030',
    categoryKey: 'organic',
    zh: '有机大麦若叶青汁 30 包',
    ja: '有機大麦若葉 青汁 30包',
    en: 'Organic Barley Grass Aojiru, 30 sachets',
    priceCny: 8900,
    isNew: true,
  },
  {
    sku: 'HF-COL-500',
    categoryKey: 'beauty',
    zh: '胶原蛋白肽饮 500ml',
    ja: 'コラーゲンペプチドドリンク 500ml',
    en: 'Collagen Peptide Drink, 500 ml',
    priceCny: 29800,
    originalPriceCny: 35800,
    isOnSale: true,
  },
  {
    sku: 'HF-PRO-060',
    categoryKey: 'supplement',
    zh: '益生菌粉末 60 条',
    ja: '乳酸菌パウダー 60本',
    en: 'Probiotic Powder, 60 sticks',
    priceCny: 15800,
  },
  {
    sku: 'HF-LUT-090',
    categoryKey: 'kids',
    zh: '叶黄素酯软糖 90 粒',
    ja: 'ルテイン グミ 90粒',
    en: 'Lutein Ester Gummies, 90 pieces',
    priceCny: 9800,
    isNew: true,
  },
]

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database')
  }

  console.log('seeding categories...')
  const categoryIds = new Map<string, string>()
  for (const [index, category] of CATEGORIES.entries()) {
    const created = await prisma.category.create({
      data: {
        name: { 'zh-CN': category.zh, 'ja-JP': category.ja, 'en-US': category.en },
        icon: '',
        sort: index,
      },
    })
    categoryIds.set(category.key, created.id)
  }

  console.log('seeding products...')
  for (const product of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        sku: product.sku,
        name: { 'zh-CN': product.zh, 'ja-JP': product.ja, 'en-US': product.en },
        subtitle: {
          'zh-CN': '日本原装进口 · 跨境直邮',
          'ja-JP': '日本製・越境直送',
          'en-US': 'Imported from Japan · Direct cross-border shipping',
        },
        categoryId: categoryIds.get(product.categoryKey)!,
        /**
         * 画像は空にしておく。
         * 存在しない CDN パスを入れると開発中ずっと 404 が出続け、
         * 本物のエラーが埋もれる。空ならクライアントの SafeImage が
         * プレースホルダを出す（＝「未入稿」の正しい表現）。
         * 実運用では管理画面から CDN の URL を登録する。
         */
        thumbnail: '',
        images: [],
        priceCny: product.priceCny,
        originalPriceCny: product.originalPriceCny ?? null,
        costCny: Math.round(product.priceCny * 0.55),
        description: {
          'zh-CN': '严选优质原料，日本 GMP 认证工厂生产，全程冷链配送。',
          'ja-JP': '厳選した原料を使用し、日本国内の GMP 認定工場で製造しています。',
          'en-US':
            'Made from carefully selected ingredients at a GMP-certified factory in Japan, shipped under temperature control.',
        },
        ingredients: {
          'zh-CN': '维生素 C、维生素 E、锌酵母、大豆提取物、明胶（胶囊）',
          'ja-JP': 'ビタミンC、ビタミンE、亜鉛酵母、大豆抽出物、ゼラチン（カプセル）',
          'en-US': 'Vitamin C, vitamin E, zinc yeast, soybean extract, gelatin (capsule shell)',
        },
        // ここに書ける文言は法務確認済みのものだけ。効能効果の断定表現は入れない。
        benefits: {
          'zh-CN': '适宜人群：需要补充维生素的成年人。不适宜人群：孕妇、哺乳期妇女、儿童。',
          'ja-JP': '対象：ビタミン補給をしたい成人。対象外：妊娠・授乳中の方、お子さま。',
          'en-US':
            'For adults who want to supplement their vitamin intake. Not suitable for pregnant or breastfeeding women, or children.',
        },
        usage: {
          'zh-CN': '每日 2 粒，温水送服，饭后食用为佳。',
          'ja-JP': '1 日 2 粒を目安に、食後に水またはぬるま湯でお召し上がりください。',
          'en-US': 'Take 2 capsules a day with water, preferably after a meal.',
        },
        nutrition: [
          { name: { 'zh-CN': '能量', 'ja-JP': 'エネルギー', 'en-US': 'Energy' }, amount: '12 kJ', nrvPercent: 0 },
          { name: { 'zh-CN': '蛋白质', 'ja-JP': 'たんぱく質', 'en-US': 'Protein' }, amount: '0.2 g', nrvPercent: 0 },
          { name: { 'zh-CN': '维生素C', 'ja-JP': 'ビタミンC', 'en-US': 'Vitamin C' }, amount: '100 mg', nrvPercent: 100 },
        ],
        approvalNumber: null,
        originCountry: 'JP',
        isCrossBorder: true,
        hsCode: '2106909090',
        salesCount: Math.floor(Math.random() * 2000),
        rating: 4.5 + Math.random() * 0.5,
        reviewCount: Math.floor(Math.random() * 400),
        tags: [
          { 'zh-CN': '跨境直邮', 'ja-JP': '越境直送', 'en-US': 'Cross-border direct' },
          { 'zh-CN': '正品保障', 'ja-JP': '正規品保証', 'en-US': 'Authenticity guaranteed' },
        ],
        isNew: product.isNew ?? false,
        isOnSale: product.isOnSale ?? false,
      },
    })

    // 賞味期限の異なるロットを 2 つ入れて FEFO の挙動を確認できるようにする
    const now = Date.now()
    await prisma.stockBatch.createMany({
      data: [
        {
          productId: created.id,
          batchNo: `${product.sku}-L2601`,
          expiryDate: new Date(now + 180 * 24 * 3600 * 1000),
          quantity: 40,
          warehouse: 'NINGBO-BONDED',
        },
        {
          productId: created.id,
          batchNo: `${product.sku}-L2606`,
          expiryDate: new Date(now + 540 * 24 * 3600 * 1000),
          quantity: 120,
          warehouse: 'NINGBO-BONDED',
        },
      ],
    })
  }

  console.log('seeding coupons...')
  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME30',
        type: 'amount',
        title: { 'zh-CN': '新客立减 30 元', 'ja-JP': '初回 30 元 OFF', 'en-US': 'CNY 30 off your first order' },
        value: 3000,
        minAmountCny: 9900,
        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      },
      {
        code: 'FREESHIP',
        type: 'shipping',
        title: { 'zh-CN': '免运费', 'ja-JP': '送料無料', 'en-US': 'Free shipping' },
        value: 0,
        minAmountCny: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    ],
  })

  console.log('seeding HS code tax rates...')
  /**
   * 越境EC 綜合税の税率。
   * 実効税率 = (増値税率 + 消費税率) / (1 - 消費税率) × 優遇係数
   * 健康食品は消費税 0% なので、増値税 13% → 9.1%、9% → 6.3% になる。
   * 実運用では税関の公表値に合わせて運用者が管理画面から更新する。
   */
  await prisma.hsCodeTaxRate.createMany({
    data: [
      {
        hsCode: '2106909090',
        name: {
          'zh-CN': '其他食品制剂（膳食补充剂）',
          'ja-JP': 'その他調製食料品（栄養補助食品）',
          'en-US': 'Other food preparations (dietary supplements)',
        },
        tariffRate: 0,
        vatRate: 0.13,
        exciseRate: 0,
        discount: 0.7,
      },
      {
        hsCode: '2106901000',
        name: { 'zh-CN': '保健食品', 'ja-JP': '保健食品', 'en-US': 'Health food' },
        tariffRate: 0,
        vatRate: 0.13,
        exciseRate: 0,
        discount: 0.7,
      },
      {
        hsCode: '2202991900',
        name: {
          'zh-CN': '其他非酒精饮料',
          'ja-JP': 'その他ノンアルコール飲料',
          'en-US': 'Other non-alcoholic beverages',
        },
        tariffRate: 0,
        // 飲料の一部は軽減税率 9%
        vatRate: 0.09,
        exciseRate: 0,
        discount: 0.7,
      },
      {
        hsCode: '3304990090',
        name: {
          'zh-CN': '其他美容品（护肤）',
          'ja-JP': 'その他美容用品（スキンケア）',
          'en-US': 'Other cosmetics (skincare)',
        },
        tariffRate: 0,
        vatRate: 0.13,
        // 高価格帯の化粧品は消費税の対象になる
        exciseRate: 0.15,
        discount: 0.7,
      },
    ],
  })

  console.log('seeding lottery prizes...')
  /**
   * 抽選盤は 3x3 で、中央（slot 4）は抽選ボタンなので賞品を置かない。
   * weight は当選重み。ここでは合計 1000 になるよう配分している。
   * 現物（product）は在庫を絞り、当たりすぎないようにする。
   */
  await prisma.lotteryPrize.createMany({
    data: [
      {
        slot: 0,
        name: { 'zh-CN': '50 积分', 'ja-JP': '50 ポイント', 'en-US': '50 points' },
        type: 'points',
        payload: '50',
        weight: 300,
      },
      {
        slot: 1,
        name: { 'zh-CN': '最近一单免单', 'ja-JP': '直近のご注文が無料', 'en-US': 'Your latest order on us' },
        type: 'free_order',
        weight: 1,
        stock: 10,
      },
      {
        slot: 2,
        name: { 'zh-CN': '15 元立减券', 'ja-JP': '15元割引クーポン', 'en-US': 'CNY 15 off coupon' },
        type: 'coupon',
        // seed 後に Coupon.id を差し込む（下で更新する）
        payload: null,
        weight: 80,
      },
      {
        slot: 3,
        name: { 'zh-CN': '幸运值 +1', 'ja-JP': 'ラッキー値 +1', 'en-US': 'Luck +1' },
        type: 'luck',
        weight: 250,
      },
      // slot 4 は中央の抽選ボタン
      {
        slot: 5,
        name: { 'zh-CN': '20 积分', 'ja-JP': '20 ポイント', 'en-US': '20 points' },
        type: 'points',
        payload: '20',
        weight: 300,
      },
      {
        slot: 6,
        name: { 'zh-CN': '鱼油一盒', 'ja-JP': 'フィッシュオイル 1 箱', 'en-US': 'One box of fish oil' },
        type: 'product',
        payload: null,
        weight: 4,
        stock: 50,
      },
      {
        slot: 7,
        name: { 'zh-CN': '12 元满减券', 'ja-JP': '12元割引クーポン', 'en-US': 'CNY 12 off coupon' },
        type: 'coupon',
        payload: null,
        weight: 60,
      },
      {
        slot: 8,
        name: { 'zh-CN': '儿童益生菌', 'ja-JP': 'こども用乳酸菌', 'en-US': 'Kids probiotics' },
        type: 'product',
        payload: null,
        weight: 5,
        stock: 30,
      },
    ],
  })

  // クーポン賞品に実際の Coupon.id を紐づける
  const welcome = await prisma.coupon.findUnique({ where: { code: 'WELCOME30' } })
  if (welcome) {
    await prisma.lotteryPrize.updateMany({
      where: { type: 'coupon', payload: null },
      data: { payload: welcome.id },
    })
  }

  // 現物賞品に実際の Product.id を紐づける
  const fishOil = await prisma.product.findUnique({ where: { sku: 'HF-MVM-060' } })
  if (fishOil) {
    await prisma.lotteryPrize.updateMany({
      where: { type: 'product', payload: null },
      data: { payload: fishOil.id },
    })
  }

  console.log('done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
