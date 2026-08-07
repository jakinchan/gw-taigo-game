import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'node:crypto'

/**
 * 保存時暗号化（application-level encryption）。
 *
 * 対象は身分証番号・実名など、漏洩したときに本人に直接被害が及ぶ項目。
 * DB のディスク暗号化だけでは、DB への読み取り権限を得た攻撃者や
 * バックアップの流出に対して無力なので、アプリ層で暗号化する。
 *
 * ■ 2 つの鍵を使い分ける理由
 *   - ENCRYPTION_KEY: AES-256-GCM の暗号化鍵。復号が必要な用途（通関申告）
 *   - HASH_PEPPER:    HMAC-SHA256 の鍵。等値比較・集計に使う決定的ハッシュ
 *
 *   身分証番号は「復号せずに同一人物か判定したい」場面がある。
 *   越境EC の年間購入限度額は個人単位で集計するため、暗号文（毎回変わる）
 *   では突合できず、決定的ハッシュが要る。
 *   素の SHA-256 だと身分証番号は形式が既知で総当たりできてしまうため、
 *   必ず鍵付き（HMAC）にする。
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name)
  private readonly key: Buffer
  private readonly pepper: Buffer

  /** 暗号文のフォーマットバージョン。鍵ローテーション時に識別子を増やす。 */
  private static readonly VERSION = 'v1'

  constructor(private readonly config: ConfigService) {
    this.key = this.loadKey('ENCRYPTION_KEY', 32)
    this.pepper = this.loadKey('HASH_PEPPER', 32)
  }

  private loadKey(name: string, expectedBytes: number): Buffer {
    const raw = this.config.getOrThrow<string>(name)
    const buf = Buffer.from(raw, 'base64')

    if (buf.length !== expectedBytes) {
      // 短い鍵で起動させない。ここを緩めると暗号強度が黙って落ちる。
      throw new InternalServerErrorException(
        `${name} must decode to ${expectedBytes} bytes (got ${buf.length}). ` +
          `Generate one with: openssl rand -base64 ${expectedBytes}`,
      )
    }
    return buf
  }

  /**
   * 暗号化。出力は `v1:<iv>:<tag>:<ciphertext>`（各 base64）。
   * IV は毎回ランダムなので、同じ平文でも暗号文は毎回変わる。
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12) // GCM の推奨 IV 長は 96 bit
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [
      CryptoService.VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':')
  }

  /**
   * 復号。改ざんされていれば GCM の認証タグ検証で例外になる。
   * 復号は通関申告など「本当に必要な処理」からのみ呼ぶこと。
   */
  decrypt(payload: string): string {
    const parts = payload.split(':')
    if (parts.length !== 4 || parts[0] !== CryptoService.VERSION) {
      throw new InternalServerErrorException('Unsupported ciphertext format')
    }

    const [, ivB64, tagB64, dataB64] = parts
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivB64, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

    try {
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    } catch (err) {
      this.logger.error(`decryption failed (tampered or wrong key): ${String(err)}`)
      throw new InternalServerErrorException('Decryption failed')
    }
  }

  /**
   * 決定的ハッシュ。同じ入力からは常に同じ出力が出るので、
   * 復号せずに等値比較・GROUP BY ができる。
   */
  hash(value: string): string {
    return crypto.createHmac('sha256', this.pepper).update(value.trim()).digest('hex')
  }

  /**
   * 身分証番号のマスク表示。中国の身分証は 18 桁。
   * 先頭 6 桁（行政区画）と末尾 4 桁だけ残す。
   * @example '110101199003077777' -> '110101********7777'
   */
  maskIdCard(idCard: string): string {
    if (idCard.length !== 18) return '****'
    return `${idCard.slice(0, 6)}${'*'.repeat(8)}${idCard.slice(-4)}`
  }

  /** 氏名のマスク表示。'张三丰' -> '张**' */
  maskName(name: string): string {
    if (name.length <= 1) return name
    return `${name[0]}${'*'.repeat(name.length - 1)}`
  }
}
