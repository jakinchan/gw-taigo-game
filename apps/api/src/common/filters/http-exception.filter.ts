import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'

/**
 * 例外を { code, message, data: null } に正規化する。
 *
 * code の設計:
 *   0      成功
 *   4xxxx  クライアント起因（HTTP ステータス × 100 + 詳細）
 *   50000  サーバ内部エラー
 *
 * 本番では内部エラーの詳細をクライアントへ返さない。
 * スタックトレースや SQL の断片が漏れると攻撃の手がかりになる。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = 'Internal server error'
    /**
     * 業務エラーコード。クライアントはこれで分岐する
     * （例: REAL_NAME_REQUIRED なら実名認証画面へ誘導）。
     * HTTP ステータスだけでは「なぜ 400 なのか」が伝わらない。
     */
    let errorCode: string | undefined
    /** limitCny / remainingCny など、UI で出し分けるための付随情報 */
    let details: Record<string, unknown> | undefined

    if (isHttp) {
      const payload = exception.getResponse()

      if (typeof payload === 'string') {
        message = payload
      } else if (typeof payload === 'object' && payload !== null) {
        const obj = payload as Record<string, unknown>

        if ('message' in obj) {
          const raw = obj.message as string | string[]
          // ValidationPipe は message を配列で返す
          message = Array.isArray(raw) ? raw[0] : raw
        }

        // throw new BadRequestException({ code: 'XXX', ... }) の形を拾う
        if (typeof obj.code === 'string') errorCode = obj.code

        const extra = Object.fromEntries(
          Object.entries(obj).filter(
            ([key]) => !['message', 'code', 'statusCode', 'error'].includes(key),
          ),
        )
        if (Object.keys(extra).length > 0) details = extra
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    }

    response.status(status).json({
      code: status * 100,
      message,
      ...(errorCode ? { errorCode } : {}),
      ...(details ? { details } : {}),
      data: null,
    })
  }
}
