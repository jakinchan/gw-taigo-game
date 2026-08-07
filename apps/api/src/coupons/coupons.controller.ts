import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsInt, IsString, MaxLength, Min } from 'class-validator'

import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/jwt.strategy'
import { CouponsService } from './coupons.service'

class ValidateCouponDto {
  @IsString()
  @MaxLength(32)
  code!: string

  @IsInt()
  @Min(0)
  subtotalCny!: number
}

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'クーポンコードの検証と割引額の算出' })
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(user.id, dto.code, dto.subtotalCny)
  }
}
