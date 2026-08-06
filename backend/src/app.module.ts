import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'

import { PrismaModule } from './common/prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { ProductsModule } from './products/products.module'
import { OrdersModule } from './orders/orders.module'
import { UsersModule } from './users/users.module'
import { PaymentModule } from './payment/payment.module'
import { FxModule } from './fx/fx.module'
import { CouponsModule } from './coupons/coupons.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ScheduleModule.forRoot(),

    /**
     * レート制限。決済系エンドポイントは各コントローラで更に厳しくする。
     * 小程序は 1 ユーザーが短時間に商品一覧を何度も叩くので、
     * グローバルは緩めにしておく。
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    UsersModule,
    PaymentModule,
    FxModule,
    CouponsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
