import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 微信の code を JWT に交換する。総当たりを防ぐため強めのレート制限をかける。 */
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: '微信小程序ログイン（code → JWT）' })
  login(@Body() dto: LoginDto): Promise<{ token: string }> {
    return this.authService.loginWithCode(dto.code)
  }
}
