import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'

import type { AdminJwtPayload } from './admin-auth.service'

/**
 * 管理 API 専用のガード。
 *
 * 商城の JwtAuthGuard とは別物で、role: 'admin' を持つトークンだけを通す。
 * 一般利用者のトークンで在庫や価格を書き換えられないようにするため、
 * 「認証済みかどうか」ではなく「管理者かどうか」で判定する。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const header = request.headers.authorization ?? ''

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('管理者トークンが必要です')
    }

    try {
      const payload = await this.jwt.verifyAsync<AdminJwtPayload>(header.slice('Bearer '.length), {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      })

      if (payload.role !== 'admin') {
        throw new UnauthorizedException('管理者権限がありません')
      }
      return true
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      throw new UnauthorizedException('管理者トークンが無効です')
    }
  }
}
