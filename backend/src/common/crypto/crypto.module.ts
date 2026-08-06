import { Global, Module } from '@nestjs/common'
import { CryptoService } from './crypto.service'

/** 暗号化は複数モジュール（users / orders / customs）から使うため Global にする */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
