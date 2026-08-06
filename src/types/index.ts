/**
 * アプリ全体で共有するドメイン型。
 * バックエンド（NestJS）の DTO と 1:1 で対応させること。
 */

/** 対応言語。既定は簡体中国語。 */
export type Locale = 'zh-CN' | 'ja-JP'

/** 多言語テキスト。API はこの形で商品名・説明を返す。 */
export interface LocalizedText {
  'zh-CN': string
  'ja-JP': string
}

export type Currency = 'CNY' | 'JPY'

/** 金額は必ず「最小通貨単位の整数」で扱う（CNY=分, JPY=円）。浮動小数は禁止。 */
export interface Money {
  /** 最小通貨単位の整数値。CNY 12.80 → 1280 */
  amount: number
  currency: Currency
}

// ------------------------------------------------------------
// 商品
// ------------------------------------------------------------

export interface Category {
  id: string
  name: LocalizedText
  /** アイコン画像 URL（WebP 推奨） */
  icon: string
  sort: number
  children?: Category[]
}

/** 健康食品の栄養成分表示（中国「食品安全国家标准 GB 28050」対応項目） */
export interface NutritionItem {
  name: LocalizedText
  /** 「12.5g」「300mg」など単位込みの表示値 */
  amount: string
  /** 栄養素等表示基準値（NRV）に対する割合 */
  nrvPercent?: number
}

/** 在庫ロット。賞味期限管理のため FEFO（先に期限が来るものから出荷）で引き当てる。 */
export interface StockBatch {
  batchNo: string
  /** ISO 8601 (YYYY-MM-DD) */
  expiryDate: string
  quantity: number
}

export interface Product {
  id: string
  sku: string
  name: LocalizedText
  subtitle: LocalizedText
  categoryId: string
  /** 一覧用サムネイル */
  thumbnail: string
  /** 詳細ページのスライドショー画像（3〜5枚） */
  images: string[]
  /** 販売価格（CNY・分単位） */
  priceCny: number
  /** 参考価格（取り消し線表示用・任意） */
  originalPriceCny?: number
  /** 販売可能在庫の合計 */
  stock: number
  /** ロット別在庫（詳細ページでのみ返る） */
  batches?: StockBatch[]
  /** 商品説明（成分・効能・使用方法） */
  description: LocalizedText
  ingredients: LocalizedText
  /** 「効能」表記は中国の広告法規制に抵触しうるため、承認済み文言のみを CMS 側で管理する */
  benefits: LocalizedText
  usage: LocalizedText
  /** 保健食品批准文号（「蓝帽子」）。一般食品の場合は null。 */
  approvalNumber: string | null
  /** 原産国 ISO 3166-1 alpha-2 */
  originCountry: string
  /** 越境EC（保税・直邮）対象商品か */
  isCrossBorder: boolean
  salesCount: number
  rating: number
  reviewCount: number
  tags: LocalizedText[]
  isNew: boolean
  isOnSale: boolean
  createdAt: string
}

export type ProductSort = 'default' | 'sales' | 'price_asc' | 'price_desc' | 'newest'

export interface ProductQuery {
  categoryId?: string
  keyword?: string
  sort?: ProductSort
  page?: number
  pageSize?: number
}

export interface Paginated<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface Review {
  id: string
  productId: string
  userNickname: string
  userAvatar: string
  rating: number
  content: string
  images: string[]
  createdAt: string
}

// ------------------------------------------------------------
// カート
// ------------------------------------------------------------

export interface CartItem {
  productId: string
  sku: string
  name: LocalizedText
  thumbnail: string
  priceCny: number
  quantity: number
  stock: number
  selected: boolean
}

// ------------------------------------------------------------
// ユーザー・住所
// ------------------------------------------------------------

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'platinum'

export interface UserProfile {
  id: string
  nickname: string
  avatar: string
  memberLevel: MemberLevel
  points: number
  /** 越境EC通関に必要な実名認証の完了フラグ */
  realNameVerified: boolean
}

export interface Address {
  id: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  postalCode?: string
  isDefault: boolean
  /** 越境EC通関申告に必要な身分証番号（下4桁以外はマスクして返る） */
  idCardMasked?: string
}

// ------------------------------------------------------------
// クーポン
// ------------------------------------------------------------

export type CouponType = 'amount' | 'percent' | 'shipping'

export interface Coupon {
  id: string
  code: string
  type: CouponType
  title: LocalizedText
  /** 割引額（分）または割引率（%） */
  value: number
  /** 利用下限金額（分） */
  minAmountCny: number
  expiresAt: string
  used: boolean
}

// ------------------------------------------------------------
// 注文・決済
// ------------------------------------------------------------

export type ShippingMethod = 'standard' | 'express'

export type OrderStatus =
  | 'pending_payment' // 待付款
  | 'pending_shipment' // 待发货
  | 'shipped' // 待收货
  | 'completed' // 已完成
  | 'cancelled' // 已取消
  | 'refunding' // 退款中

export interface OrderItem {
  productId: string
  sku: string
  name: LocalizedText
  thumbnail: string
  priceCny: number
  quantity: number
}

export interface OrderAmounts {
  /** 商品小計（分） */
  subtotalCny: number
  /** 送料（分） */
  shippingFeeCny: number
  /** 割引（分・正の値） */
  discountCny: number
  /** 越境EC 行郵税・関税等（分） */
  taxCny: number
  /** 支払総額（分） */
  totalCny: number
  /** 参考表示用の日本円換算額（決済確定額ではない） */
  totalJpyEstimate: number
  /** 換算に使用したレート（1 CNY = fxRate JPY） */
  fxRate: number
  /** レート取得時刻 */
  fxQuotedAt: string
}

export interface Order {
  id: string
  orderNo: string
  status: OrderStatus
  items: OrderItem[]
  amounts: OrderAmounts
  address: Address
  shippingMethod: ShippingMethod
  trackingNo?: string
  remark?: string
  createdAt: string
  paidAt?: string
}

/** 小程序決済に必要な wx.requestPayment 用パラメータ（バックエンドが署名して返す） */
export interface WechatPayParams {
  timeStamp: string
  nonceStr: string
  /** 'prepay_id=xxx' 形式 */
  package: string
  signType: 'RSA'
  paySign: string
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
