import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { CouponType, Prisma } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'

export interface ValidatedCoupon {
  id: string
  code: string
  type: CouponType
  title: Prisma.JsonValue
  value: number
  minAmountCny: number
  expiresAt: string
  used: boolean
  /** この注文に対して実際に効く割引額（分） */
  discountCny: number
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string) {
    const rows = await this.prisma.userCoupon.findMany({
      where: { userId },
      include: { coupon: true },
      orderBy: { createdAt: 'desc' },
    })

    return rows.map((row) => ({
      id: row.coupon.id,
      code: row.coupon.code,
      type: row.coupon.type,
      title: row.coupon.title,
      value: row.coupon.value,
      minAmountCny: row.coupon.minAmountCny,
      expiresAt: row.coupon.expiresAt.toISOString(),
      used: row.used,
    }))
  }

  /**
   * クーポンの検証と割引額の算出。
   * 「使えるか」と「いくら引けるか」を必ずサーバで決める。
   */
  async validate(userId: string, code: string, subtotalCny: number): Promise<ValidatedCoupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } })
    if (!coupon) throw new NotFoundException('Coupon not found')

    const now = new Date()
    if (coupon.startsAt > now) throw new BadRequestException('Coupon is not active yet')
    if (coupon.expiresAt < now) throw new BadRequestException('Coupon expired')
    if (coupon.totalLimit !== null && coupon.usedCount >= coupon.totalLimit) {
      throw new BadRequestException('Coupon exhausted')
    }
    if (subtotalCny < coupon.minAmountCny) {
      throw new BadRequestException('Order total is below the coupon minimum')
    }

    // ユーザーに紐づくクーポンの場合、使用済みなら弾く。
    // 紐づきが無い（公開コード）場合は誰でも 1 回使える扱いにする。
    const userCoupon = await this.prisma.userCoupon.findUnique({
      where: { userId_couponId: { userId, couponId: coupon.id } },
    })
    if (userCoupon?.used) throw new BadRequestException('Coupon already used')

    let discountCny = 0
    switch (coupon.type) {
      case 'amount':
        discountCny = Math.min(coupon.value, subtotalCny)
        break
      case 'percent':
        discountCny = Math.round((subtotalCny * coupon.value) / 100)
        break
      case 'shipping':
        // 送料無料はここでは 0。OrdersService が送料を 0 にする。
        discountCny = 0
        break
    }

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      title: coupon.title,
      value: coupon.value,
      minAmountCny: coupon.minAmountCny,
      expiresAt: coupon.expiresAt.toISOString(),
      used: false,
      discountCny,
    }
  }

  /** 注文確定時に消し込む。OrdersService のトランザクション内から呼ばれる。 */
  async markUsed(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string,
    orderId: string,
  ): Promise<void> {
    const coupon = await tx.coupon.findUnique({ where: { code } })
    if (!coupon) return

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    })

    await tx.userCoupon.upsert({
      where: { userId_couponId: { userId, couponId: coupon.id } },
      update: { used: true, usedAt: new Date(), orderId },
      create: { userId, couponId: coupon.id, used: true, usedAt: new Date(), orderId },
    })
  }
}
