import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import * as express from 'express'

import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 微信支付の通知は署名検証に生ボディが必要なので、後で raw body を有効にする
    rawBody: true,
  })

  const config = app.get(ConfigService)
  const port = config.get<number>('PORT', 3000)
  const isProd = config.get('NODE_ENV') === 'production'

  app.setGlobalPrefix('api')

  // ---- セキュリティ ----
  app.use(helmet({ contentSecurityPolicy: isProd }))

  /**
   * 微信支付の支付通知だけは JSON パース前の生ボディが必要。
   * APIv3 の署名検証は「タイムスタンプ\nnonce\nbody\n」に対して行うため、
   * パース後に再シリアライズしたものでは検証に通らない。
   */
  app.use('/api/payment/wechat/notify', express.raw({ type: 'application/json' }))

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean),
    credentials: true,
  })

  // ---- 入力値検証（XSS / 型不正 / 想定外フィールドの防御） ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO に無いプロパティは削除する
      forbidNonWhitelisted: true, // 想定外のフィールドが来たら 400
      transform: true, // クエリ文字列を DTO の型へ変換
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // ---- レスポンス形式の統一 { code, message, data } ----
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())

  // ---- API ドキュメント（本番では公開しない） ----
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Health Food Shop API')
      .setDescription('健康食品跨境电商 小程序 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig))
  }

  await app.listen(port)
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap')
}

void bootstrap()
