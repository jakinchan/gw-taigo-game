import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { FxService, type FxQuote } from './fx.service'

@ApiTags('fx')
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('cny-jpy')
  @ApiOperation({ summary: 'CNY→JPY の参考レート（表示専用・決済確定額ではない）' })
  quote(): FxQuote {
    return this.fxService.getQuote()
  }
}
