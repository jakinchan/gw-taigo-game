import { Module } from '@nestjs/common'

import { CouponsModule } from '../coupons/coupons.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [CouponsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
