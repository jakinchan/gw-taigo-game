import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/** 認証必須のエンドポイントに付ける。@UseGuards(JwtAuthGuard) */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
