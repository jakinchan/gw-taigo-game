import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

import { AdminAuthService } from './admin-auth.service'
import { AdminController } from './admin.controller'
import { AdminGuard } from './admin.guard'
import { AdminService } from './admin.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService, AdminGuard],
})
export class AdminModule {}
