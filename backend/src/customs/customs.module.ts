import { Global, Module } from '@nestjs/common'

import { CustomsService } from './customs.service'
import { PurchaseLimitService } from './purchase-limit.service'
import { TaxRateService } from './tax-rate.service'

/**
 * 越境EC のコンプライアンス関連をまとめたモジュール。
 * orders / payment / users から使うので Global にしている。
 */
@Global()
@Module({
  providers: [CustomsService, PurchaseLimitService, TaxRateService],
  exports: [CustomsService, PurchaseLimitService, TaxRateService],
})
export class CustomsModule {}
