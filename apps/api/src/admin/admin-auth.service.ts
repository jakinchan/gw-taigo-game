import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as crypto from 'node:crypto'

export interface AdminJwtPayload {
  sub: string
  role: 'admin'
}

/**
 * 管理画面のログイン。
 *
 * 商城の認証（微信 code2session → JWT）とは経路を完全に分ける。
 * 同じトークンで商城 API と管理 API の両方が叩けると、
 * 一般利用者のトークンが漏れたときに在庫や価格まで書き換えられてしまう。
 * 管理者トークンには role: 'admin' を入れ、AdminGuard がそれだけを通す。
 *
 * 現状はパスワード 1 本の運用。運用者が増えたら Admin テーブルを作り、
 * ユーザーごとのハッシュと権限を持たせること。
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name)

  private readonly passwordHash: string
  private readonly configured: boolean

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const password = this.config.get<string>('ADMIN_PASSWORD', '')
    this.configured = password.length > 0
    // 平文をメモリに残さない
    this.passwordHash = this.configured ? hashPassword(password) : ''

    if (!this.configured) {
      this.logger.warn(
        'ADMIN_PASSWORD が未設定です。管理 API はすべて 401 を返します。' +
          '設定するとログインできるようになります。',
      )
    }
  }

  async login(password: string): Promise<{ token: string }> {
    if (!this.configured) {
      throw new UnauthorizedException('管理者パスワードが設定されていません')
    }

    /**
     * タイミング攻撃を避けるため、長さが違っても必ず同じ処理時間で比較する。
     * ハッシュ同士を timingSafeEqual にかければ長さは常に一致する。
     */
    const candidate = hashPassword(password)
    const matched = crypto.timingSafeEqual(
      Buffer.from(candidate, 'hex'),
      Buffer.from(this.passwordHash, 'hex'),
    )

    if (!matched) {
      this.logger.warn('管理画面のログインに失敗（パスワード不一致）')
      throw new UnauthorizedException('パスワードが違います')
    }

    const payload: AdminJwtPayload = { sub: 'admin', role: 'admin' }
    return { token: await this.jwt.signAsync(payload, { expiresIn: '12h' }) }
  }
}

/** 比較用のハッシュ。保存はしないので固定ソルトで十分。 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`hfs-admin:${password}`).digest('hex')
}
