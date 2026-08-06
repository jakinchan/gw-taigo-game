import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrderStatus } from '@prisma/client'

import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/jwt.strategy'
import { OrdersService } from './orders.service'
import { CreateOrderDto, PreviewOrderDto } from './dto/create-order.dto'

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('preview')
  @ApiOperation({ summary: '金額プレビュー（送料・税・割引をサーバ計算）' })
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewOrderDto) {
    return this.ordersService.preview(user.id, dto)
  }

  /** 在庫を確保する処理なので、連打による在庫食い潰しを防ぐ */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: '注文作成（在庫を FEFO で引き当て）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: '注文一覧' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: OrderStatus,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    return this.ordersService.findAll(user.id, status, page)
  }

  @Get(':id')
  @ApiOperation({ summary: '注文詳細' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findOne(user.id, id)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '注文キャンセル（未払いのみ・在庫を戻す）' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.cancel(user.id, id)
  }
}
