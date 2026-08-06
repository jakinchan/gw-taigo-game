import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/jwt.strategy'
import { CouponsService } from '../coupons/coupons.service'
import { UsersService } from './users.service'
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/address.dto'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly couponsService: CouponsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'プロフィール取得' })
  profile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id)
  }

  @Put()
  @ApiOperation({ summary: 'プロフィール更新' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto)
  }

  @Get('addresses')
  @ApiOperation({ summary: '住所一覧' })
  addresses(@CurrentUser() user: AuthUser) {
    return this.usersService.listAddresses(user.id)
  }

  @Post('addresses')
  @ApiOperation({ summary: '住所追加' })
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.usersService.createAddress(user.id, dto)
  }

  @Put('addresses/:id')
  @ApiOperation({ summary: '住所更新' })
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(user.id, id, dto)
  }

  @Delete('addresses/:id')
  @HttpCode(200)
  @ApiOperation({ summary: '住所削除' })
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<null> {
    await this.usersService.deleteAddress(user.id, id)
    return null
  }

  @Get('coupons')
  @ApiOperation({ summary: '保有クーポン一覧' })
  coupons(@CurrentUser() user: AuthUser) {
    return this.couponsService.findMine(user.id)
  }
}
