import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { IsString, MaxLength } from 'class-validator'
import type { Request } from 'express'

import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/jwt.strategy'
import { PaymentService } from './payment.service'
import { PlatformCertificateService } from './platform-certificate.service'
import { WechatPayService } from './wechat-pay.service'

class CreatePaymentDto {
  @IsString()
  @MaxLength(32)
  orderNo!: string
}

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name)

  constructor(
    private readonly paymentService: PaymentService,
    private readonly wechatPay: WechatPayService,
    private readonly certificates: PlatformCertificateService,
  ) {}

  @Post('wechat')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: '決済パラメータ発行（wx.requestPayment 用の署名を返す）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.paymentService.createPayment(user.id, dto.orderNo)
  }

  @Get('status/:orderNo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '入金確定の確認（小程序が決済後にポーリングする）' })
  status(@CurrentUser() user: AuthUser, @Param('orderNo') orderNo: string) {
    return this.paymentService.getStatus(user.id, orderNo)
  }

  @Get('quote/:orderNo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '越境決済の精算見込み（参考値）' })
  quote(@CurrentUser() user: AuthUser, @Param('orderNo') orderNo: string) {
    return this.paymentService.getQuote(user.id, orderNo)
  }

  /**
   * 微信支付からの支付通知。
   *
   * - 認証は JWT ではなく「署名検証」で行う。微信からのリクエストに Bearer は付かない。
   * - 生ボディが必要なので main.ts で express.raw を適用している。
   * - 応答は微信が定めた形式で返す。5 秒以内に 200 を返さないと再送される。
   * - 処理に失敗しても 200 を返す方が安全なケースがあるが、ここでは
   *   「検証に失敗した通知」だけ非 200 にして再送を促す。
   */
  @Post('wechat/notify')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async notify(
    @Req() request: Request,
    @Headers('wechatpay-timestamp') timestamp: string,
    @Headers('wechatpay-nonce') nonce: string,
    @Headers('wechatpay-signature') signature: string,
    @Headers('wechatpay-serial') serial: string,
  ): Promise<{ code: string; message: string }> {
    const rawBody = request.body as Buffer

    if (!timestamp || !nonce || !signature || !serial || !Buffer.isBuffer(rawBody)) {
      this.logger.warn('notify rejected: missing signature headers or raw body')
      return { code: 'FAIL', message: 'invalid request' }
    }

    /**
     * 署名検証。これが通らない通知は「微信支付から来た」と見なせない。
     * 検証を飛ばすと、誰でもこのエンドポイントを叩いて注文を
     * 支払い済みにできてしまう。
     */
    const verified = await this.certificates.verify(
      serial,
      timestamp,
      nonce,
      rawBody.toString('utf8'),
      signature,
    )

    if (!verified) {
      this.logger.error(`notify signature verification failed (serial=${serial})`)
      // 偽の通知に再送を促す必要はないが、証明書取得の一時失敗で
      // 正規の通知を落とした可能性もあるため FAIL を返して再送させる
      return { code: 'FAIL', message: 'signature verification failed' }
    }

    try {
      const decrypted = this.wechatPay.decryptNotify(rawBody)
      await this.paymentService.handleNotify(decrypted)
      return { code: 'SUCCESS', message: 'OK' }
    } catch (err) {
      this.logger.error(`notify handling failed: ${String(err)}`)
      // FAIL を返すと微信が再送してくれる
      return { code: 'FAIL', message: 'processing error' }
    }
  }
}
