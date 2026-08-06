import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import { PrismaService } from '../common/prisma/prisma.service'

interface Code2SessionResponse {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export interface JwtPayload {
  sub: string
  openId: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 微信小程序のログイン。
   *
   * wx.login が返す code をここで session に交換する。
   * code は 5 分で失効し、1 度しか使えない。
   *
   * session_key は「絶対にクライアントへ返さない」。
   * これが漏れると暗号化されたユーザーデータを第三者が復号できてしまう。
   */
  async loginWithCode(code: string): Promise<{ token: string }> {
    const appId = this.config.getOrThrow<string>('WECHAT_APP_ID')
    const secret = this.config.getOrThrow<string>('WECHAT_APP_SECRET')

    const url =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${appId}&secret=${secret}&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`

    const response = await fetch(url)
    const session = (await response.json()) as Code2SessionResponse

    if (session.errcode || !session.openid) {
      this.logger.warn(`code2session failed: ${session.errcode} ${session.errmsg}`)
      throw new HttpException('WeChat login failed', HttpStatus.UNAUTHORIZED)
    }

    const user = await this.prisma.user.upsert({
      where: { openId: session.openid },
      update: { unionId: session.unionid ?? undefined },
      create: { openId: session.openid, unionId: session.unionid ?? null },
    })

    const payload: JwtPayload = { sub: user.id, openId: user.openId }
    return { token: await this.jwt.signAsync(payload) }
  }
}
