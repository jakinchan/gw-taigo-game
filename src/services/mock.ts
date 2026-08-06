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

export const mockCategories: Category[] = [
  { id: 'c1', name: { 'zh-CN': '营养补充剂', 'ja-JP': '栄養補助食品' }, icon: `${IMG}/cat-supplement.png`, sort: 1 },
  { id: 'c2', name: { 'zh-CN': '有机食品', 'ja-JP': 'オーガニック食品' }, icon: `${IMG}/cat-organic.png`, sort: 2 },
  { id: 'c3', name: { 'zh-CN': '健康饮品', 'ja-JP': '健康ドリンク' }, icon: `${IMG}/cat-drink.png`, sort: 3 },
  { id: 'c4', name: { 'zh-CN': '美容养颜', 'ja-JP': '美容・エイジングケア' }, icon: `${IMG}/cat-beauty.png`, sort: 4 },
  { id: 'c5', name: { 'zh-CN': '体重管理', 'ja-JP': '体重管理' }, icon: `${IMG}/cat-weight.png`, sort: 5 },
  { id: 'c6', name: { 'zh-CN': '儿童营养', 'ja-JP': 'こども向け栄養' }, icon: `${IMG}/cat-kids.png`, sort: 6 },
  { id: 'c7', name: { 'zh-CN': '中老年', 'ja-JP': 'シニア向け' }, icon: `${IMG}/cat-senior.png`, sort: 7 },
  { id: 'c8', name: { 'zh-CN': '运动营养', 'ja-JP': 'スポーツ栄養' }, icon: `${IMG}/cat-sports.png`, sort: 8 },
]

function makeProduct(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    sku: `SKU-${overrides.id}`,
    subtitle: { 'zh-CN': '日本原装进口 · 60 粒装', 'ja-JP': '日本製 60 粒入り' },
    categoryId: 'c1',
    thumbnail: `${IMG}/${overrides.id}.jpg`,
    images: [`${IMG}/${overrides.id}-1.jpg`, `${IMG}/${overrides.id}-2.jpg`, `${IMG}/${overrides.id}-3.jpg`],
    priceCny: 12800,
    originalPriceCny: 16800,
    stock: 120,
    description: {
      'zh-CN': '严选优质原料，日本 GMP 认证工厂生产，全程冷链配送。',
      'ja-JP': '厳選した原料を使用し、日本国内の GMP 認定工場で製造。冷蔵便でお届けします。',
    },
    ingredients: {
      'zh-CN': '维生素 C、维生素 E、锌酵母、大豆提取物、明胶（胶囊）',
      'ja-JP': 'ビタミンC、ビタミンE、亜鉛酵母、大豆抽出物、ゼラチン（カプセル）',
    },
    benefits: {
      'zh-CN': '适宜人群：需要补充维生素的成年人。不适宜人群：孕妇、哺乳期妇女、儿童。',
      'ja-JP': '対象：ビタミン補給をしたい成人。対象外：妊娠・授乳中の方、お子さま。',
    },
    usage: {
      'zh-CN': '每日 2 粒，温水送服，饭后食用为佳。',
      'ja-JP': '1 日 2 粒を目安に、食後に水またはぬるま湯でお召し上がりください。',
    },
    approvalNumber: null,
    originCountry: 'JP',
    isCrossBorder: true,
    salesCount: 1280,
    rating: 4.8,
    reviewCount: 326,
    tags: [
      { 'zh-CN': '跨境直邮', 'ja-JP': '越境直送' },
      { 'zh-CN': '正品保障', 'ja-JP': '正規品保証' },
    ],
    isNew: false,
    isOnSale: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

export const mockProducts: Product[] = [
  makeProduct({
    id: 'p1',
    name: { 'zh-CN': '复合维生素矿物质胶囊', 'ja-JP': 'マルチビタミン＆ミネラル' },
    priceCny: 12800,
    isOnSale: true,
  }),
  makeProduct({
    id: 'p2',
    name: { 'zh-CN': '深海鱼油 Omega-3', 'ja-JP': 'DHA・EPA オメガ3' },
    priceCny: 19800,
    originalPriceCny: 24800,
    categoryId: 'c1',
    isNew: true,
  }),
  makeProduct({
    id: 'p3',
    name: { 'zh-CN': '有机大麦若叶青汁', 'ja-JP': '有機大麦若葉 青汁' },
    priceCny: 8900,
    categoryId: 'c2',
    approvalNumber: null,
    isNew: true,
  }),
  makeProduct({
    id: 'p4',
    name: { 'zh-CN': '胶原蛋白肽饮', 'ja-JP': 'コラーゲンペプチドドリンク' },
    priceCny: 29800,
    originalPriceCny: 35800,
    categoryId: 'c4',
    isOnSale: true,
  }),
  makeProduct({
    id: 'p5',
    name: { 'zh-CN': '益生菌粉末', 'ja-JP': '乳酸菌パウダー' },
    priceCny: 15800,
    categoryId: 'c1',
    stock: 8,
  }),
  makeProduct({
    id: 'p6',
    name: { 'zh-CN': '黑芝麻核桃粉', 'ja-JP': '黒ごまくるみパウダー' },
    priceCny: 6800,
    categoryId: 'c2',
  }),
  makeProduct({
    id: 'p7',
    name: { 'zh-CN': '乳清蛋白粉', 'ja-JP': 'ホエイプロテイン' },
    priceCny: 32800,
    categoryId: 'c8',
    stock: 0,
  }),
  makeProduct({
    id: 'p8',
    name: { 'zh-CN': '叶黄素酯软糖', 'ja-JP': 'ルテイン グミ' },
    priceCny: 9800,
    categoryId: 'c6',
    isNew: true,
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
