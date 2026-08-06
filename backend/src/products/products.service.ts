import { Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'
import { ProductSort, QueryProductsDto } from './dto/query-products.dto'

/** 一覧では在庫ロットや原価を返さない（転送量と情報漏洩の両方の理由から） */
const LIST_SELECT = {
  id: true,
  sku: true,
  name: true,
  subtitle: true,
  categoryId: true,
  thumbnail: true,
  priceCny: true,
  originalPriceCny: true,
  description: true,
  ingredients: true,
  benefits: true,
  usage: true,
  approvalNumber: true,
  originCountry: true,
  isCrossBorder: true,
  salesCount: true,
  rating: true,
  reviewCount: true,
  tags: true,
  isNew: true,
  isOnSale: true,
  createdAt: true,
  images: true,
} satisfies Prisma.ProductSelect

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sort: 'asc' },
      include: { children: { orderBy: { sort: 'asc' } } },
    })
  }

  async findAll(query: QueryProductsDto) {
    const { categoryId, keyword, sort, page, pageSize } = query

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(keyword
        ? {
            // JSON カラムの多言語名を横断検索する。
            // 中国語・日本語の両方でヒットさせたいので string_contains を OR で並べる。
            OR: [
              { name: { path: ['zh-CN'], string_contains: keyword } },
              { name: { path: ['ja-JP'], string_contains: keyword } },
              { sku: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const orderBy = this.buildOrderBy(sort)

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.product.count({ where }),
    ])

    // 在庫は StockBatch の合計。一覧では「在庫あり/なし」が分かれば十分なので集計だけ取る。
    const stockMap = await this.aggregateStock(rows.map((r) => r.id))

    return {
      list: rows.map((row) => ({ ...row, stock: stockMap.get(row.id) ?? 0 })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      include: {
        // 期限切れロットは出荷できないので返さない。FEFO 順に並べる。
        batches: {
          where: { expiryDate: { gt: new Date() } },
          orderBy: { expiryDate: 'asc' },
          select: { batchNo: true, expiryDate: true, quantity: true, reserved: true },
        },
      },
    })

    if (!product) throw new NotFoundException('Product not found')

    const { costCny: _costCny, hsCode: _hsCode, batches, ...rest } = product

    return {
      ...rest,
      stock: batches.reduce((sum, b) => sum + (b.quantity - b.reserved), 0),
      batches: batches.map((b) => ({
        batchNo: b.batchNo,
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        quantity: b.quantity - b.reserved,
      })),
    }
  }

  /** トップページのデータを 1 往復で返す */
  async homeFeed() {
    const [categories, recommended, newArrivals, onSale] = await Promise.all([
      this.prisma.category.findMany({ where: { parentId: null }, orderBy: { sort: 'asc' }, take: 8 }),
      this.prisma.product.findMany({
        where: { isActive: true },
        orderBy: { salesCount: 'desc' },
        take: 4,
        select: LIST_SELECT,
      }),
      this.prisma.product.findMany({
        where: { isActive: true, isNew: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: LIST_SELECT,
      }),
      this.prisma.product.findMany({
        where: { isActive: true, isOnSale: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: LIST_SELECT,
      }),
    ])

    const ids = [...recommended, ...newArrivals, ...onSale].map((p) => p.id)
    const stockMap = await this.aggregateStock(ids)
    const withStock = <T extends { id: string }>(rows: T[]) =>
      rows.map((row) => ({ ...row, stock: stockMap.get(row.id) ?? 0 }))

    return {
      // バナーは CMS 管理を想定。ここでは静的定義を返す。
      banners: [
        { id: 'b1', image: '/static/banners/banner-1.webp', link: '' },
        { id: 'b2', image: '/static/banners/banner-2.webp', link: '' },
        { id: 'b3', image: '/static/banners/banner-3.webp', link: '' },
      ],
      categories,
      recommended: withStock(recommended),
      newArrivals: withStock(newArrivals),
      onSale: withStock(onSale),
    }
  }

  async findReviews(productId: string, page = 1, pageSize = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { nickname: true, avatar: true } } },
      }),
      this.prisma.review.count({ where: { productId } }),
    ])

    return {
      list: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        // レビュアーのニックネームは伏せ字にする（個人特定を避けるため）
        userNickname: maskNickname(row.user.nickname),
        userAvatar: row.user.avatar,
        rating: row.rating,
        content: row.content,
        images: row.images,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  async findRelated(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true },
    })
    if (!product) return []

    const rows = await this.prisma.product.findMany({
      where: { categoryId: product.categoryId, isActive: true, id: { not: productId } },
      orderBy: { salesCount: 'desc' },
      take: 4,
      select: LIST_SELECT,
    })

    const stockMap = await this.aggregateStock(rows.map((r) => r.id))
    return rows.map((row) => ({ ...row, stock: stockMap.get(row.id) ?? 0 }))
  }

  // ----------------------------------------------------------

  private buildOrderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case ProductSort.sales:
        return { salesCount: 'desc' }
      case ProductSort.price_asc:
        return { priceCny: 'asc' }
      case ProductSort.price_desc:
        return { priceCny: 'desc' }
      case ProductSort.newest:
        return { createdAt: 'desc' }
      default:
        // 「综合」は売れ筋を優先しつつ、新しいものも拾う
        return { salesCount: 'desc' }
    }
  }

  /**
   * 商品 ID ごとの引き当て可能在庫（期限内ロットの quantity - reserved の合計）。
   * N+1 を避けるため groupBy 1 回で取る。
   */
  private async aggregateStock(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map()

    const batches = await this.prisma.stockBatch.findMany({
      where: { productId: { in: productIds }, expiryDate: { gt: new Date() } },
      select: { productId: true, quantity: true, reserved: true },
    })

    const map = new Map<string, number>()
    for (const batch of batches) {
      const available = batch.quantity - batch.reserved
      map.set(batch.productId, (map.get(batch.productId) ?? 0) + Math.max(available, 0))
    }
    return map
  }
}

/** 「张三丰」→「张*丰」のように中間を伏せる */
function maskNickname(nickname: string): string {
  if (nickname.length <= 1) return nickname || '匿名'
  if (nickname.length === 2) return `${nickname[0]}*`
  return `${nickname[0]}${'*'.repeat(nickname.length - 2)}${nickname[nickname.length - 1]}`
}
