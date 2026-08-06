import { Module } from '@nestjs/common'

import { PaymentController } from './payment.controller'
import { PaymentService } from './payment.service'
import { WechatPayService } from './wechat-pay.service'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayService],
  exports: [PaymentService],
})
export class PaymentModule {}
