import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class LoginDto {
  /** wx.login() が返す一時 code */
  @ApiProperty({ description: 'wx.login() の code' })
  @IsString()
  @Length(1, 128)
  code!: string
}
