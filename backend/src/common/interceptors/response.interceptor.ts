import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, map } from 'rxjs'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/**
 * すべての正常レスポンスを { code: 0, message: 'ok', data } に統一する。
 * 小程序側の utils/request.ts がこの形を前提にしている。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<{ path?: string }>()

    return next.handle().pipe(
      map((data) => {
        // 微信支付の通知応答だけは微信が定めた形式を返す必要があるため包まない
        if (request.path?.endsWith('/payment/wechat/notify')) {
          return data as unknown as ApiResponse<T>
        }
        return { code: 0, message: 'ok', data }
      }),
    )
  }
}
