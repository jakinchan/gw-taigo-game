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
  { key: 'supplement', zh: '营养补充剂', ja: '栄養補助食品' },
  { key: 'organic', zh: '有机食品', ja: 'オーガニック食品' },
  { key: 'drink', zh: '健康饮品', ja: '健康ドリンク' },
  { key: 'beauty', zh: '美容养颜', ja: '美容・エイジングケア' },
  { key: 'weight', zh: '体重管理', ja: '体重管理' },
  { key: 'kids', zh: '儿童营养', ja: 'こども向け栄養' },
]

const PRODUCTS = [
  {
    sku: 'HF-MVM-060',
    categoryKey: 'supplement',
    zh: '复合维生素矿物质胶囊 60 粒',
    ja: 'マルチビタミン＆ミネラル 60粒',
    priceCny: 12800,
    originalPriceCny: 16800,
    isOnSale: true,
  },
  {
    sku: 'HF-OMG-090',
    categoryKey: 'supplement',
    zh: '深海鱼油 Omega-3 90 粒',
    ja: 'DHA・EPA オメガ3 90粒',
    priceCny: 19800,
    originalPriceCny: 24800,
    isNew: true,
  },
  {
    sku: 'HF-AOJ-030',
    categoryKey: 'organic',
    zh: '有机大麦若叶青汁 30 包',
    ja: '有機大麦若葉 青汁 30包',
    priceCny: 8900,
    isNew: true,
  },
  {
    sku: 'HF-COL-500',
    categoryKey: 'beauty',
    zh: '胶原蛋白肽饮 500ml',
    ja: 'コラーゲンペプチドドリンク 500ml',
    priceCny: 29800,
    originalPriceCny: 35800,
    isOnSale: true,
  },
  {
    sku: 'HF-PRO-060',
    categoryKey: 'supplement',
    zh: '益生菌粉末 60 条',
    ja: '乳酸菌パウダー 60本',
    priceCny: 15800,
  },
  {
    sku: 'HF-LUT-090',
    categoryKey: 'kids',
    zh: '叶黄素酯软糖 90 粒',
    ja: 'ルテイン グミ 90粒',
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
        name: { 'zh-CN': category.zh, 'ja-JP': category.ja },
        icon: `/static/categories/${category.key}.webp`,
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
        name: { 'zh-CN': product.zh, 'ja-JP': product.ja },
        subtitle: {
          'zh-CN': '日本原装进口 · 跨境直邮',
          'ja-JP': '日本製・越境直送',
        },
        categoryId: categoryIds.get(product.categoryKey)!,
        thumbnail: `/static/products/${product.sku}.webp`,
        images: [
          `/static/products/${product.sku}-1.webp`,
          `/static/products/${product.sku}-2.webp`,
          `/static/products/${product.sku}-3.webp`,
        ],
        priceCny: product.priceCny,
        originalPriceCny: product.originalPriceCny ?? null,
        costCny: Math.round(product.priceCny * 0.55),
        description: {
          'zh-CN': '严选优质原料，日本 GMP 认证工厂生产，全程冷链配送。',
          'ja-JP': '厳選した原料を使用し、日本国内の GMP 認定工場で製造しています。',
        },
        ingredients: {
          'zh-CN': '维生素 C、维生素 E、锌酵母、大豆提取物、明胶（胶囊）',
          'ja-JP': 'ビタミンC、ビタミンE、亜鉛酵母、大豆抽出物、ゼラチン（カプセル）',
        },
        // ここに書ける文言は法務確認済みのものだけ。効能効果の断定表現は入れない。
        benefits: {
          'zh-CN': '适宜人群：需要补充维生素的成年人。不适宜人群：孕妇、哺乳期妇女、儿童。',
          'ja-JP': '対象：ビタミン補給をしたい成人。対象外：妊娠・授乳中の方、お子さま。',
        },
        usage: {
          'zh-CN': '每日 2 粒，温水送服，饭后食用为佳。',
          'ja-JP': '1 日 2 粒を目安に、食後に水またはぬるま湯でお召し上がりください。',
        },
        nutrition: [
          { name: { 'zh-CN': '能量', 'ja-JP': 'エネルギー' }, amount: '12 kJ', nrvPercent: 0 },
          { name: { 'zh-CN': '蛋白质', 'ja-JP': 'たんぱく質' }, amount: '0.2 g', nrvPercent: 0 },
          { name: { 'zh-CN': '维生素C', 'ja-JP': 'ビタミンC' }, amount: '100 mg', nrvPercent: 100 },
        ],
        approvalNumber: null,
        originCountry: 'JP',
        isCrossBorder: true,
        hsCode: '2106909090',
        salesCount: Math.floor(Math.random() * 2000),
        rating: 4.5 + Math.random() * 0.5,
        reviewCount: Math.floor(Math.random() * 400),
        tags: [
          { 'zh-CN': '跨境直邮', 'ja-JP': '越境直送' },
          { 'zh-CN': '正品保障', 'ja-JP': '正規品保証' },
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
        title: { 'zh-CN': '新客立减 30 元', 'ja-JP': '初回 30 元 OFF' },
        value: 3000,
        minAmountCny: 9900,
        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      },
      {
        code: 'FREESHIP',
        type: 'shipping',
        title: { 'zh-CN': '免运费', 'ja-JP': '送料無料' },
        value: 0,
        minAmountCny: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    ],
  })

  console.log('done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
