import { Module, type OnModuleInit } from '@nestjs/common'

import { PaymentController } from './payment.controller'
import { PaymentService } from './payment.service'
import { PlatformCertificateService } from './platform-certificate.service'
import { WechatPayService } from './wechat-pay.service'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayService, PlatformCertificateService],
  exports: [PaymentService],
})
export class PaymentModule implements OnModuleInit {
  constructor(private readonly certificates: PlatformCertificateService) {}

  /**
   * 起動後にプラットフォーム証明書を先読みしておく。
   * 支付通知が来てから取りに行くと、微信の 5 秒タイムアウトに間に合わない
   * ことがある。未設定の環境では何もしない。
   */
  onModuleInit(): void {
    this.certificates.startBackgroundRefresh()
  }
}
