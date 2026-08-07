import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export enum ShippingMethodDto {
  standard = 'standard',
  express = 'express',
}

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  productId!: string

  /**
   * 単価はクライアントから受け取らない。
   * 受け取ると改ざんできてしまうので、必ずサーバ側の DB 価格を使う。
   */
  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[]

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  addressId!: string

  @ApiProperty({ enum: ShippingMethodDto })
  @IsEnum(ShippingMethodDto)
  shippingMethod!: ShippingMethodDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  couponCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** プレビューは備考が不要なだけで、他は同じ */
export class PreviewOrderDto extends CreateOrderDto {}
