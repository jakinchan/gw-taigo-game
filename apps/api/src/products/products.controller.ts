import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { ProductsService } from './products.service'
import { QueryProductsDto } from './dto/query-products.dto'

@ApiTags('products')
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'カテゴリ一覧' })
  categories() {
    return this.productsService.findCategories()
  }

  @Get('home-feed')
  @ApiOperation({ summary: 'トップページ用データ（バナー・カテゴリ・おすすめ・新着・セール）' })
  homeFeed() {
    return this.productsService.homeFeed()
  }

  @Get('products')
  @ApiOperation({ summary: '商品一覧（カテゴリ・キーワード・並び替え）' })
  list(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query)
  }

  @Get('products/:id')
  @ApiOperation({ summary: '商品詳細（在庫ロット・賞味期限込み）' })
  detail(@Param('id') id: string) {
    return this.productsService.findOne(id)
  }

  @Get('products/:id/reviews')
  @ApiOperation({ summary: '商品レビュー' })
  reviews(@Param('id') id: string, @Query('page', new ParseIntPipe({ optional: true })) page = 1) {
    return this.productsService.findReviews(id, page)
  }

  @Get('products/:id/related')
  @ApiOperation({ summary: '関連商品' })
  related(@Param('id') id: string) {
    return this.productsService.findRelated(id)
  }
}
