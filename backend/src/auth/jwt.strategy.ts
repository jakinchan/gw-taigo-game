import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { PrismaService } from '../common/prisma/prisma.service'
import type { JwtPayload } from './auth.service'

export interface AuthUser {
  id: string
  openId: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    })
  }

  /**
   * 署名が正しくても、ユーザーが削除されている場合は拒否する。
   * トークンの有効期限（7 日）の間にアカウントが消えることはあるため。
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, openId: true },
    })
    if (!user) throw new UnauthorizedException()
    return user
  }
}
