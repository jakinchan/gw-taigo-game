import { Global, Module } from '@nestjs/common'

import { FxController } from './fx.controller'
import { FxService } from './fx.service'

/** 注文・決済の両方でレートが要るので Global にする */
@Global()
@Module({
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
