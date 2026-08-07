import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class AdminLoginDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password!: string
}

export class UpdateProductDto {
  /** 販売価格（分）。0 は「無料」を意味してしまうので 1 以上。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCny?: number

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  originalPriceCny?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isNew?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOnSale?: boolean

  /** 通関申告と税率の決定に使う */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnail?: string
}

export class CreateBatchDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  batchNo!: string

  /** 賞味期限。FEFO の並び順を決める。 */
  @ApiProperty({ example: '2027-06-30' })
  @IsDateString()
  expiryDate!: string

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouse?: string
}

export class ShipOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  trackingNo!: string
}
