import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export class CreateAddressDto {
  @ApiProperty()
  @IsString()
  @MaxLength(20)
  receiverName!: string

  /** 中国本土の携帯番号。通関申告と配送で必須。 */
  @ApiProperty({ example: '13800138000' })
  @Matches(/^1[3-9]\d{9}$/, { message: 'Invalid Chinese mobile number' })
  phone!: string

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  province!: string

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  city!: string

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  district!: string

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  detail!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nickname?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string
}
