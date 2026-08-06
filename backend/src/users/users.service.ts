import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../common/prisma/prisma.service'
import { CryptoService } from '../common/crypto/crypto.service'
import { PurchaseLimitService } from '../customs/purchase-limit.service'
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/address.dto'
import { RealNameDto } from './dto/real-name.dto'

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly purchaseLimits: PurchaseLimitService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        memberLevel: true,
        points: true,
        realNameVerified: true,
        idCardEncrypted: true,
        realNameEncrypted: true,
      },
    })
    if (!user) throw new NotFoundException('User not found')

    const { idCardEncrypted, realNameEncrypted, ...rest } = user

    return {
      ...rest,
      // 平文は返さない。本人確認済みであることが分かる最小限だけ見せる。
      realNameMasked: realNameEncrypted
        ? this.crypto.maskName(this.crypto.decrypt(realNameEncrypted))
        : null,
      idCardMasked: idCardEncrypted
        ? this.crypto.maskIdCard(this.crypto.decrypt(idCardEncrypted))
        : null,
    }
  }

  /**
   * 実名認証の登録。
   *
   * 越境EC の通関申告では、注文者・支払者・受取人の三者一致が求められ、
   * 申告名義人の実名と身分証番号が必須になる。
   *
   * ここでは形式検証とチェックディジットの検証までを行う。実運用では
   * 公安部の身分証実名認証 API（三要素認証）との突合が別途必要。
   */
  async verifyRealName(userId: string, dto: RealNameDto) {
    const idCard = dto.idCard.toUpperCase()

    if (!isValidChineseIdCard(idCard)) {
      throw new BadRequestException({
        code: 'INVALID_ID_CARD',
        message: '身份证号码校验失败',
      })
    }

    const idCardHash = this.crypto.hash(idCard)

    /**
     * 同一の身分証が別アカウントで既に使われていないか確認する。
     * 完全に禁止すると家族共用などで詰まるが、無制限だと年間限度額を
     * 迂回できてしまう。ここでは登録は許し、限度額は idCardHash で
     * 横断集計することで迂回を封じている。
     */
    const others = await this.prisma.user.count({
      where: { idCardHash, id: { not: userId } },
    })
    if (others > 0) {
      this.logger.warn(`id card reused across accounts (hash=${idCardHash.slice(0, 8)}…)`)
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        realNameEncrypted: this.crypto.encrypt(dto.realName.trim()),
        idCardEncrypted: this.crypto.encrypt(idCard),
        idCardHash,
        realNameVerified: true,
        realNameVerifiedAt: new Date(),
      },
    })

    return {
      realNameVerified: true,
      realNameMasked: this.crypto.maskName(dto.realName.trim()),
      idCardMasked: this.crypto.maskIdCard(idCard),
      quota: await this.purchaseLimits.getQuota(idCardHash),
    }
  }

  /** 越境EC の年間購入枠の使用状況 */
  async getCrossBorderQuota(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { idCardHash: true, realNameVerified: true },
    })
    return this.purchaseLimits.getQuota(user?.realNameVerified ? user.idCardHash : null)
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        nickname: true,
        avatar: true,
        memberLevel: true,
        points: true,
        realNameVerified: true,
      },
    })
  }

  async listAddresses(userId: string) {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
    return rows.map(serializeAddress)
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const address = await this.prisma.$transaction(async (tx) => {
      // 既定を 1 件に保つ。複数がデフォルトだと決済画面でどれが選ばれるか不定になる。
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      }

      // 最初の 1 件は自動的にデフォルトにする
      const count = await tx.address.count({ where: { userId } })

      return tx.address.create({
        data: { ...dto, userId, isDefault: dto.isDefault ?? count === 0 },
      })
    })
    return serializeAddress(address)
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } })
      if (!existing) throw new NotFoundException('Address not found')

      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      }

      return tx.address.update({ where: { id }, data: dto })
    })
    return serializeAddress(address)
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('Address not found')

    await this.prisma.address.delete({ where: { id } })
  }
}

/**
 * 中国居民身分証番号（18 桁）のチェックディジット検証。
 * GB 11643-1999 の ISO 7064:1983 MOD 11-2 方式。
 *
 * 形式が合っていても実在するとは限らないので、これは「明らかな打ち間違いを
 * 弾く」ためのもの。実在性の確認には公安部の実名認証 API が別途必要。
 */
export function isValidChineseIdCard(idCard: string): boolean {
  if (!/^\d{17}[\dX]$/.test(idCard)) return false

  // 生年月日部分（7-14 桁目）が実在する日付かを確認する
  const year = Number(idCard.slice(6, 10))
  const month = Number(idCard.slice(10, 12))
  const day = Number(idCard.slice(12, 14))
  const birth = new Date(Date.UTC(year, month - 1, day))
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day ||
    birth.getTime() > Date.now()
  ) {
    return false
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkChars = '10X98765432'

  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += Number(idCard[i]) * weights[i]
  }

  return checkChars[sum % 11] === idCard[17]
}

function serializeAddress(address: {
  id: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  postalCode: string | null
  isDefault: boolean
}) {
  return {
    id: address.id,
    receiverName: address.receiverName,
    // 電話番号は中 4 桁をマスクする（一覧を第三者に覗かれた場合の被害を抑える）
    phone: address.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
    province: address.province,
    city: address.city,
    district: address.district,
    detail: address.detail,
    postalCode: address.postalCode ?? undefined,
    isDefault: address.isDefault,
  }
}
