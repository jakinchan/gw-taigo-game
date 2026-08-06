import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../common/prisma/prisma.service'
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/address.dto'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    })
    if (!user) throw new NotFoundException('User not found')
    return user
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
