import type { Category, Product, Review } from '@/types'

/**
 * 開発用モックデータ。
 *
 * バックエンドを起動していなくても UI を確認できるようにするためのもの。
 * `process.env.NODE_ENV === 'development'` かつ API 呼び出しが失敗したときだけ
 * 使われる（api.ts の withMockFallback を参照）。本番ビルドでは
 * このモジュールは tree-shaking の対象になるよう副作用を持たせていない。
 */

const IMG = 'https://images.example.com/health-food'

/**
 * カテゴリは実機の悩み別分類に合わせている。
 * 首页ではチップ、全部商品では左サイドバーとして同じものを使う。
 */
export const mockCategories: Category[] = [
  { id: 'c1', name: { 'zh-CN': '基础', 'ja-JP': 'ベーシック', 'en-US': 'Basics' }, icon: `${IMG}/cat-basic.png`, sort: 1 },
  { id: 'c2', name: { 'zh-CN': '睡眠', 'ja-JP': '睡眠', 'en-US': 'Sleep' }, icon: `${IMG}/cat-sleep.png`, sort: 2 },
  { id: 'c3', name: { 'zh-CN': '肥胖', 'ja-JP': '体型管理', 'en-US': 'Weight' }, icon: `${IMG}/cat-weight.png`, sort: 3 },
  { id: 'c4', name: { 'zh-CN': '头发', 'ja-JP': '髪', 'en-US': 'Hair' }, icon: `${IMG}/cat-hair.png`, sort: 4 },
  { id: 'c5', name: { 'zh-CN': '衰老', 'ja-JP': 'エイジングケア', 'en-US': 'Aging care' }, icon: `${IMG}/cat-aging.png`, sort: 5 },
  { id: 'c6', name: { 'zh-CN': '精力 认知 记忆力', 'ja-JP': '集中・記憶', 'en-US': 'Focus & memory' }, icon: `${IMG}/cat-brain.png`, sort: 6 },
  { id: 'c7', name: { 'zh-CN': '关节', 'ja-JP': '関節', 'en-US': 'Joints' }, icon: `${IMG}/cat-joint.png`, sort: 7 },
  { id: 'c8', name: { 'zh-CN': '炎症', 'ja-JP': '炎症ケア', 'en-US': 'Inflammation' }, icon: `${IMG}/cat-inflam.png`, sort: 8 },
  { id: 'c9', name: { 'zh-CN': '心肝', 'ja-JP': '心臓・肝臓', 'en-US': 'Heart & liver' }, icon: `${IMG}/cat-heart.png`, sort: 9 },
  { id: 'c10', name: { 'zh-CN': '肠胃', 'ja-JP': '腸内環境', 'en-US': 'Gut health' }, icon: `${IMG}/cat-gut.png`, sort: 10 },
  { id: 'c11', name: { 'zh-CN': '儿童专区', 'ja-JP': 'こども向け', 'en-US': 'For kids' }, icon: `${IMG}/cat-kids.png`, sort: 11 },
  { id: 'c12', name: { 'zh-CN': '老人养护', 'ja-JP': 'シニアケア', 'en-US': 'Senior care' }, icon: `${IMG}/cat-senior.png`, sort: 12 },
]

function makeProduct(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    sku: `SKU-${overrides.id}`,
    subtitle: { 'zh-CN': '日本原装进口 · 60 粒装', 'ja-JP': '日本製 60 粒入り', 'en-US': 'Imported from Japan · 60 capsules' },
    categoryId: 'c1',
    thumbnail: `${IMG}/${overrides.id}.jpg`,
    images: [`${IMG}/${overrides.id}-1.jpg`, `${IMG}/${overrides.id}-2.jpg`, `${IMG}/${overrides.id}-3.jpg`],
    priceCny: 12800,
    originalPriceCny: 16800,
    stock: 120,
    description: {
      'zh-CN': '严选优质原料，日本 GMP 认证工厂生产，全程冷链配送。',
      'ja-JP': '厳選した原料を使用し、日本国内の GMP 認定工場で製造。冷蔵便でお届けします。',
      'en-US': 'Made from carefully selected ingredients at a GMP-certified factory in Japan, shipped under temperature control.',
    },
    ingredients: {
      'zh-CN': '维生素 C、维生素 E、锌酵母、大豆提取物、明胶（胶囊）',
      'ja-JP': 'ビタミンC、ビタミンE、亜鉛酵母、大豆抽出物、ゼラチン（カプセル）',
      'en-US': 'Vitamin C, vitamin E, zinc yeast, soybean extract, gelatin (capsule shell)',
    },
    benefits: {
      'zh-CN': '适宜人群：需要补充维生素的成年人。不适宜人群：孕妇、哺乳期妇女、儿童。',
      'ja-JP': '対象：ビタミン補給をしたい成人。対象外：妊娠・授乳中の方、お子さま。',
      'en-US': 'For adults who want to supplement their vitamin intake. Not suitable for pregnant or breastfeeding women, or children.',
    },
    usage: {
      'zh-CN': '每日 2 粒，温水送服，饭后食用为佳。',
      'ja-JP': '1 日 2 粒を目安に、食後に水またはぬるま湯でお召し上がりください。',
      'en-US': 'Take 2 capsules a day with water, preferably after a meal.',
    },
    nutrition: [
      { name: { 'zh-CN': '能量', 'ja-JP': 'エネルギー', 'en-US': 'Energy' }, amount: '12 kJ', nrvPercent: 0 },
      { name: { 'zh-CN': '蛋白质', 'ja-JP': 'たんぱく質', 'en-US': 'Protein' }, amount: '0.2 g', nrvPercent: 0 },
      { name: { 'zh-CN': '脂肪', 'ja-JP': '脂質', 'en-US': 'Fat' }, amount: '0.1 g', nrvPercent: 0 },
      { name: { 'zh-CN': '碳水化合物', 'ja-JP': '炭水化物', 'en-US': 'Carbohydrate' }, amount: '0.3 g', nrvPercent: 0 },
      { name: { 'zh-CN': '钠', 'ja-JP': '食塩相当量', 'en-US': 'Sodium' }, amount: '2 mg', nrvPercent: 0 },
      { name: { 'zh-CN': '维生素C', 'ja-JP': 'ビタミンC', 'en-US': 'Vitamin C' }, amount: '100 mg', nrvPercent: 100 },
      { name: { 'zh-CN': '维生素E', 'ja-JP': 'ビタミンE', 'en-US': 'Vitamin E' }, amount: '8 mg', nrvPercent: 57 },
      { name: { 'zh-CN': '锌', 'ja-JP': '亜鉛', 'en-US': 'Zinc' }, amount: '7.5 mg', nrvPercent: 50 },
    ],
    approvalNumber: null,
    originCountry: 'JP',
    isCrossBorder: true,
    salesCount: 1280,
    rating: 4.8,
    reviewCount: 326,
    tags: [
      { 'zh-CN': '跨境直邮', 'ja-JP': '越境直送', 'en-US': 'Cross-border direct' },
      { 'zh-CN': '正品保障', 'ja-JP': '正規品保証', 'en-US': 'Authenticity guaranteed' },
    ],
    isNew: false,
    isOnSale: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    // 実機のカード表示に対応する既定値
    priceUnit: 'month',
    hasDiscount: true,
    marketPriceRange: '¥300~¥500',
    stockLabel: 'in_stock',
    ...overrides,
  }
}

/** 実機の商品ラインナップと価格表示に寄せたモック */
export const mockProducts: Product[] = [
  makeProduct({
    id: 'p1',
    name: { 'zh-CN': '鱼油 95% 高纯度', 'ja-JP': 'フィッシュオイル 95% 高純度', 'en-US': 'Fish Oil, 95% High Purity' },
    priceCny: 6900,
    categoryId: 'c9',
    ribbon: { 'zh-CN': '本品 TOP1', 'ja-JP': '本品 TOP1', 'en-US': 'No.1 seller' },
    marketPriceRange: '¥300~¥500',
    footerTag: { 'zh-CN': '部分地区次日达', 'ja-JP': '一部地域は翌日配送', 'en-US': 'Next-day delivery in some areas' },
    isOnSale: true,
  }),
  makeProduct({
    id: 'p2',
    name: { 'zh-CN': '专利 L- 苏糖酸镁', 'ja-JP': '特許 L-トレオン酸マグネシウム', 'en-US': 'Patented Magnesium L-Threonate' },
    priceCny: 37920,
    categoryId: 'c6',
    specLabel: { 'zh-CN': '4 个月量大规格', 'ja-JP': '4か月分 大容量', 'en-US': '4-month supply' },
    marketPriceRange: '¥1000~¥4,000',
    hasDiscount: false,
    footerTag: { 'zh-CN': '现货', 'ja-JP': '在庫あり', 'en-US': 'In stock' },
  }),
  makeProduct({
    id: 'p3',
    name: { 'zh-CN': '维生素 D3 软胶囊', 'ja-JP': 'ビタミンD3 ソフトカプセル', 'en-US': 'Vitamin D3 Softgels' },
    priceCny: 825,
    categoryId: 'c1',
    specLabel: { 'zh-CN': '360 天量', 'ja-JP': '360日分', 'en-US': '360-day supply' },
    marketPriceRange: '¥15~¥47',
    footerTag: { 'zh-CN': '现货·限时 83 折', 'ja-JP': '在庫あり・期間限定 17% OFF', 'en-US': 'In stock · 17% off, limited time' },
    isNew: true,
  }),
  makeProduct({
    id: 'p4',
    name: { 'zh-CN': 'AKK 自律菌', 'ja-JP': 'AKK 菌', 'en-US': 'AKK (Akkermansia) Probiotic' },
    priceCny: 12600,
    categoryId: 'c10',
    ribbon: { 'zh-CN': '大牌保健', 'ja-JP': '大手ブランド', 'en-US': 'Top brand' },
    marketPriceRange: '¥700~¥3,000',
    footerTag: { 'zh-CN': '现货·限时 85 折', 'ja-JP': '在庫あり・期間限定 15% OFF', 'en-US': 'In stock · 15% off, limited time' },
  }),
  makeProduct({
    id: 'p5',
    name: { 'zh-CN': '还原型辅酶 Q10', 'ja-JP': '還元型コエンザイムQ10', 'en-US': 'Ubiquinol (Reduced CoQ10)' },
    priceCny: 8900,
    categoryId: 'c9',
    ribbon: { 'zh-CN': '历史低价', 'ja-JP': '過去最安', 'en-US': 'Lowest ever' },
    ribbonTone: 'accent',
    marketPriceRange: '¥300~¥600',
    footerTag: { 'zh-CN': '现货·限时 9 折', 'ja-JP': '在庫あり・期間限定 10% OFF', 'en-US': 'In stock · 10% off, limited time' },
  }),
  makeProduct({
    id: 'p6',
    name: { 'zh-CN': 'NMN 60000', 'ja-JP': 'NMN 60000', 'en-US': 'NMN 60000' },
    priceCny: 6000,
    categoryId: 'c5',
    specLabel: { 'zh-CN': '4-8 个月', 'ja-JP': '4〜8か月分', 'en-US': '4-8 month supply' },
    ribbon: { 'zh-CN': '历史低价', 'ja-JP': '過去最安', 'en-US': 'Lowest ever' },
    ribbonTone: 'accent',
    marketPriceRange: '¥3,200~¥8,000',
    footerTag: { 'zh-CN': '现货·限时 8 折', 'ja-JP': '在庫あり・期間限定 20% OFF', 'en-US': 'In stock · 20% off, limited time' },
    isNew: true,
  }),
  makeProduct({
    id: 'p7',
    name: { 'zh-CN': '麦角硫因 + 谷胱甘肽', 'ja-JP': 'エルゴチオネイン + グルタチオン', 'en-US': 'Ergothioneine + Glutathione' },
    priceCny: 6500,
    categoryId: 'c5',
    specLabel: { 'zh-CN': '4 个月量大规格', 'ja-JP': '4か月分 大容量', 'en-US': '4-month supply' },
    ribbon: { 'zh-CN': '大牌保健', 'ja-JP': '大手ブランド', 'en-US': 'Top brand' },
    marketPriceRange: '¥1,200~¥3,200',
    footerTag: { 'zh-CN': '现货·限时 83 折', 'ja-JP': '在庫あり・期間限定 17% OFF', 'en-US': 'In stock · 17% off, limited time' },
  }),
  makeProduct({
    id: 'p8',
    name: { 'zh-CN': '姜黄素 BCM-95®', 'ja-JP': 'クルクミン BCM-95®', 'en-US': 'Curcumin BCM-95®' },
    priceCny: 7400,
    categoryId: 'c8',
    specLabel: { 'zh-CN': '4 个月量大规格', 'ja-JP': '4か月分 大容量', 'en-US': '4-month supply' },
    marketPriceRange: '¥250~¥500',
    footerTag: { 'zh-CN': '现货·限时 95 折', 'ja-JP': '在庫あり・期間限定 5% OFF', 'en-US': 'In stock · 5% off, limited time' },
  }),
  makeProduct({
    id: 'p9',
    name: { 'zh-CN': '褪黑素口溶片', 'ja-JP': 'メラトニン 口腔内崩壊錠', 'en-US': 'Melatonin Orally Disintegrating Tablets' },
    priceCny: 7900,
    categoryId: 'c2',
    marketPriceRange: '¥70~¥500',
    footerTag: { 'zh-CN': '现货', 'ja-JP': '在庫あり', 'en-US': 'In stock' },
  }),
  makeProduct({
    id: 'p10',
    name: { 'zh-CN': '胶原蛋白肽', 'ja-JP': 'コラーゲンペプチド', 'en-US': 'Collagen Peptide' },
    priceCny: 8400,
    categoryId: 'c4',
    marketPriceRange: '¥300~¥800',
    footerTag: { 'zh-CN': '现货·限时 94 折', 'ja-JP': '在庫あり・期間限定 6% OFF', 'en-US': 'In stock · 6% off, limited time' },
  }),
  // 众筹专区（生産中）
  makeProduct({
    id: 'p11',
    name: { 'zh-CN': '胶原三肽 EGCG 饮', 'ja-JP': 'コラーゲントリペプチド EGCG ドリンク', 'en-US': 'Collagen Tripeptide EGCG Drink' },
    priceCny: 490,
    priceUnit: 'box',
    categoryId: 'c4',
    ribbon: { 'zh-CN': '历史低价', 'ja-JP': '過去最安', 'en-US': 'Lowest ever' },
    ribbonTone: 'accent',
    marketPriceRange: '¥150~¥200',
    stockLabel: 'producing',
    footerTag: { 'zh-CN': '生产中·限时 1 折', 'ja-JP': '生産中・期間限定 90% OFF', 'en-US': 'In production · 90% off, limited time' },
  }),
  makeProduct({
    id: 'p12',
    name: { 'zh-CN': '中老年女士复合维生素', 'ja-JP': 'シニア女性用マルチビタミン', 'en-US': 'Multivitamin for Mature Women' },
    priceCny: 900,
    categoryId: 'c12',
    marketPriceRange: '¥130~¥300',
    hasDiscount: false,
    stockLabel: 'producing',
  }),
  makeProduct({
    id: 'p13',
    name: { 'zh-CN': '反式白藜芦醇', 'ja-JP': 'トランス レスベラトロール', 'en-US': 'Trans-Resveratrol' },
    priceCny: 4750,
    categoryId: 'c5',
    marketPriceRange: '¥400~¥600',
    hasDiscount: false,
    stockLabel: 'producing',
  }),
  makeProduct({
    id: 'p14',
    name: { 'zh-CN': '女性益生菌', 'ja-JP': '女性向け乳酸菌', 'en-US': 'Probiotic for Women' },
    priceCny: 5225,
    categoryId: 'c10',
    marketPriceRange: '¥113~¥175',
    hasDiscount: false,
    stockLabel: 'producing',
  }),
]

export const mockBanners = [
  { id: 'b1', image: `${IMG}/banner-1.jpg`, link: '/pages/product/detail?id=p1' },
  { id: 'b2', image: `${IMG}/banner-2.jpg`, link: '/pages/product/detail?id=p4' },
  { id: 'b3', image: `${IMG}/banner-3.jpg`, link: '' },
]

export const mockReviews: Review[] = [
  {
    id: 'r1',
    productId: 'p1',
    userNickname: '小* 明',
    userAvatar: `${IMG}/avatar-1.png`,
    rating: 5,
    content: '包装完好，物流很快。已经吃了一个月，感觉精神好了不少。',
    images: [],
    createdAt: '2026-07-20T10:12:00.000Z',
  },
  {
    id: 'r2',
    productId: 'p1',
    userNickname: '健康 * 生活',
    userAvatar: `${IMG}/avatar-2.png`,
    rating: 4,
    content: '正品，有日文标签。价格比日本本土稍贵，但省了代购的麻烦。',
    images: [`${IMG}/review-1.jpg`],
    createdAt: '2026-07-15T08:30:00.000Z',
  },
]
