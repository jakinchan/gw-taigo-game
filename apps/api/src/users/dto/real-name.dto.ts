import { ApiProperty } from '@nestjs/swagger'
import { Matches, MaxLength, MinLength } from 'class-validator'

export class RealNameDto {
  @ApiProperty({ example: '张三' })
  @MinLength(2)
  @MaxLength(30)
  // 中国の実名は漢字（少数民族名の中黒「·」を含む）。ラテン文字も許容する。
  @Matches(/^[一-龥·A-Za-z\s]{2,30}$/, { message: 'Invalid name format' })
  realName!: string

  /**
   * 中国居民身分証番号（18 桁）。末尾のチェックディジットは X の場合がある。
   * 形式の妥当性は正規表現、チェックディジットはサービス側で検証する。
   */
  @ApiProperty({ example: '11010119900307777X' })
  @Matches(/^\d{17}[\dXx]$/, { message: 'Invalid ID card number' })
  idCard!: string
}
