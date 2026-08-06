import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export enum ProductSort {
  default = 'default',
  sales = 'sales',
  price_asc = 'price_asc',
  price_desc = 'price_desc',
  newest = 'newest',
}

export class QueryProductsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string

  /**
   * 検索キーワード。Prisma のパラメータ化クエリを通すので SQL インジェクションは起きないが、
   * 長すぎる入力は全文検索の負荷になるため 64 文字で切る。
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ enum: ProductSort })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort = ProductSort.default

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50) // 1 回で取りすぎるとレスポンスが小程序のメモリを圧迫する
  pageSize = 20
}
