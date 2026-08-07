import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { AdminAuthService } from './admin-auth.service'
import { AdminGuard } from './admin.guard'
import { AdminService } from './admin.service'
import {
  AdminLoginDto,
  CreateBatchDto,
  ShipOrderDto,
  UpdateProductDto,
} from './dto/admin.dto'

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly admin: AdminService,
  ) {}

  /** ログインだけは認証不要。総当たりを防ぐため強めに絞る。 */
  @Post('login')
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @ApiOperation({ summary: '管理者ログイン' })
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto.password)
  }

  // ---- 以下はすべて管理者トークンが必要 ----

  @Get('overview')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'ダッシュボードの集計' })
  overview() {
    return this.admin.getOverview()
  }

  @Put('products/:id')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '商品の更新（価格・公開状態・HS コード）' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.admin.updateProduct(id, dto)
  }

  @Get('products/:id/batches')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '在庫ロット一覧（FEFO 順）' })
  batches(@Param('id') id: string) {
    return this.admin.listBatches(id)
  }

  @Post('products/:id/batches')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '在庫ロットの追加（入庫）' })
  addBatch(@Param('id') id: string, @Body() dto: CreateBatchDto) {
    return this.admin.addBatch(id, dto)
  }

  @Delete('batches/:batchId')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '在庫ロットの削除（確保済みがあると拒否）' })
  removeBatch(@Param('batchId') batchId: string) {
    return this.admin.removeBatch(batchId)
  }

  @Post('orders/:id/ship')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '出荷登録（発送待ちの注文のみ）' })
  ship(@Param('id') id: string, @Body() dto: ShipOrderDto) {
    return this.admin.shipOrder(id, dto)
  }

  @Get('tax-rates')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'HS コード別税率の一覧' })
  taxRates() {
    return this.admin.listTaxRates()
  }
}
