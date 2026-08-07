import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { IsString, Length } from 'class-validator'

import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/jwt.strategy'
import { LotteryService } from './lottery.service'

class DrawDto {
  /**
   * クライアントが生成する UUID。通信断による再送で
   * 二重に積分を引かないための冪等キー。
   */
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string
}

@ApiTags('lottery')
@Controller('lottery')
export class LotteryController {
  constructor(private readonly lotteryService: LotteryService) {}

  @Get('board')
  @ApiOperation({ summary: '抽選盤の賞品一覧（確率と在庫は返さない）' })
  board() {
    return this.lotteryService.getBoard()
  }

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '保有積分と本日の残り回数' })
  status(@CurrentUser() user: AuthUser) {
    return this.lotteryService.getStatus(user.id)
  }

  /**
   * 抽選の実行。連打で積分を溶かされないよう厳しめに絞る。
   * 当選判定・積分消費・在庫減算はすべてサーバ側の 1 トランザクション。
   */
  @Post('draw')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @ApiOperation({ summary: '抽選を 1 回実行する' })
  draw(@CurrentUser() user: AuthUser, @Body() dto: DrawDto) {
    return this.lotteryService.draw(user.id, dto.idempotencyKey)
  }

  @Get('prizes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '当選履歴（我的奖品）' })
  prizes(@CurrentUser() user: AuthUser, @Query('page') page = 1) {
    return this.lotteryService.getMyPrizes(user.id, Number(page) || 1)
  }
}
