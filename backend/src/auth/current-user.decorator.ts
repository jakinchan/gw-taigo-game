import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthUser } from './jwt.strategy'

/**
 * JwtAuthGuard を通過したリクエストから認証済みユーザーを取り出す。
 * @example findAll(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user
  },
)
