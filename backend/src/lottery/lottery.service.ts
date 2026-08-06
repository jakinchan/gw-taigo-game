import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { PrizeType, type LotteryPrize, type Prisma } from '@prisma/client'
import { randomInt } from 'node:crypto'

import { PrismaService } from '../common/prisma/prisma.service'

/** 1 回あたりの消費積分 */
export const POINTS_PER_DRAW = 100

/** 1 日あたりの上限回数 */
export const MAX_DRAWS_PER_DAY = 10

export interface DrawResult {
  prizeId: string
  slot: number
  name: Prisma.JsonValue
  type: PrizeType
  pointsCost: number
  /** 抽選後の残り積分 */
  pointsBalance: number
  /** 当日の残り回数 */
  remainingToday: number
}

/**
 * 抽選（幸运大抽奖）。
 *
 * ■ なぜサーバで抽選するのか
 *   クライアントで乱数を引くと、パッケージを解析して当選結果を
 *   書き換えられる。景品には実物や免単（注文無料化）が含まれるため、
 *   金銭的な被害に直結する。当選判定・積分の消費・在庫の減算は
 *   すべてこのサービスの 1 トランザクションで完結させる。
 *
 * ■ Math.random を使わない理由
 *   V8 の Math.random は暗号論的に安全ではなく、内部状態を推測すると
 *   次の出目を予測できる。景品が絡む抽選では crypto.randomInt を使う。
 *
 * ■ 冪等性
 *   通信が切れてクライアントが再送しても二重に積分を引かないよう、
 *   idempotencyKey で 1 回だけ成立させる。
 */
@Injectable()
export class LotteryService {
  private readonly logger = new Logger(LotteryService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** 抽選盤の表示用。重み・在庫は返さない（確率を推測させない）。 */
  async getBoard() {
    const prizes = await this.prisma.lotteryPrize.findMany({
      where: { isActive: true },
      orderBy: { slot: 'asc' },
      select: { id: true, name: true, type: true, slot: true },
    })
    return { prizes, pointsPerDraw: POINTS_PER_DRAW, maxDrawsPerDay: MAX_DRAWS_PER_DAY }
  }

  /** マイページ・抽選ページのヘッダー表示用 */
  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { points: true, lastDrawDate: true, drawCountToday: true },
    })

    const usedToday = isSameUtcDay(user.lastDrawDate, new Date()) ? user.drawCountToday : 0

    return {
      points: user.points,
      remainingToday: Math.max(MAX_DRAWS_PER_DAY - usedToday, 0),
      pointsPerDraw: POINTS_PER_DRAW,
    }
  }

  /**
   * 抽選を 1 回実行する。
   *
   * @param idempotencyKey クライアントが生成する UUID。再送時は同じ値を送る。
   */
  async draw(userId: string, idempotencyKey: string): Promise<DrawResult> {
    // 既に成立済みなら、同じ結果を返す（積分は再消費しない）
    const existing = await this.prisma.lotteryDraw.findUnique({
      where: { idempotencyKey },
      include: { prize: true },
    })
    if (existing) {
      if (existing.userId !== userId) {
        throw new ConflictException('Idempotency key belongs to another user')
      }
      const status = await this.getStatus(userId)
      return {
        prizeId: existing.prize.id,
        slot: existing.prize.slot,
        name: existing.prize.name,
        type: existing.prize.type,
        pointsCost: existing.pointsCost,
        pointsBalance: status.points,
        remainingToday: status.remainingToday,
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { points: true, lastDrawDate: true, drawCountToday: true },
      })

      const now = new Date()
      const sameDay = isSameUtcDay(user.lastDrawDate, now)
      const usedToday = sameDay ? user.drawCountToday : 0

      if (usedToday >= MAX_DRAWS_PER_DAY) {
        throw new BadRequestException({
          code: 'NO_DRAW_CHANCE',
          message: '今日抽奖次数已用完',
        })
      }
      if (user.points < POINTS_PER_DRAW) {
        throw new BadRequestException({
          code: 'NOT_ENOUGH_POINTS',
          message: '积分不足',
        })
      }

      // 在庫のある有効な賞品だけを候補にする
      const candidates = await tx.lotteryPrize.findMany({
        where: {
          isActive: true,
          OR: [{ stock: null }, { stock: { gt: 0 } }],
          weight: { gt: 0 },
        },
      })
      if (candidates.length === 0) {
        throw new ConflictException('No prize available')
      }

      const prize = pickWeighted(candidates)

      /**
       * 積分の消費は条件付き更新にする。
       * 「読んでから引く」を別クエリでやると、同時実行で残高がマイナスになる。
       */
      const deducted = await tx.user.updateMany({
        where: { id: userId, points: { gte: POINTS_PER_DRAW } },
        data: {
          points: { decrement: POINTS_PER_DRAW },
          lastDrawDate: now,
          drawCountToday: sameDay ? { increment: 1 } : 1,
        },
      })
      if (deducted.count === 0) {
        throw new ConflictException('Points changed during draw; please retry')
      }

      // 在庫のある賞品は同様に条件付きで減らす
      if (prize.stock !== null) {
        const taken = await tx.lotteryPrize.updateMany({
          where: { id: prize.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        })
        if (taken.count === 0) {
          // 直前に他のユーザーが取り切った。トランザクションごと巻き戻す。
          throw new ConflictException('Prize just ran out; please retry')
        }
      }

      await tx.lotteryDraw.create({
        data: { userId, prizeId: prize.id, pointsCost: POINTS_PER_DRAW, idempotencyKey },
      })

      await this.grantPrize(tx, userId, prize)

      const after = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { points: true, drawCountToday: true },
      })

      this.logger.log(`user ${userId} drew prize ${prize.id} (${prize.type})`)

      return {
        prizeId: prize.id,
        slot: prize.slot,
        name: prize.name,
        type: prize.type,
        pointsCost: POINTS_PER_DRAW,
        pointsBalance: after.points,
        remainingToday: Math.max(MAX_DRAWS_PER_DAY - after.drawCountToday, 0),
      }
    })
  }

  /**
   * 当選景品の付与。
   * 現物と免単は運用者の手作業が要るので、記録だけ残して claimed=false のままにする。
   */
  private async grantPrize(
    tx: Prisma.TransactionClient,
    userId: string,
    prize: LotteryPrize,
  ): Promise<void> {
    switch (prize.type) {
      case PrizeType.points: {
        const amount = Number(prize.payload ?? 0)
        if (amount > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { points: { increment: amount } },
          })
        }
        break
      }

      case PrizeType.coupon: {
        if (!prize.payload) break
        // 同じクーポンを既に持っていても抽選を失敗させない
        await tx.userCoupon.upsert({
          where: { userId_couponId: { userId, couponId: prize.payload } },
          update: { used: false, usedAt: null, orderId: null },
          create: { userId, couponId: prize.payload },
        })
        break
      }

      case PrizeType.product:
      case PrizeType.free_order:
      case PrizeType.luck:
      case PrizeType.none:
        // 記録のみ。運用側が LotteryDraw を見て処理する。
        break
    }
  }

  /** 当選履歴（我的奖品） */
  async getMyPrizes(userId: string, page = 1, pageSize = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lotteryDraw.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { prize: { select: { name: true, type: true } } },
      }),
      this.prisma.lotteryDraw.count({ where: { userId } }),
    ])

    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.prize.name,
        type: row.prize.type,
        claimed: row.claimed,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }
}

// ------------------------------------------------------------

/**
 * 重み付き抽選。
 * crypto.randomInt は上限排他なので [0, totalWeight) の一様乱数になる。
 */
function pickWeighted(prizes: LotteryPrize[]): LotteryPrize {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0)
  let ticket = randomInt(totalWeight)

  for (const prize of prizes) {
    ticket -= prize.weight
    if (ticket < 0) return prize
  }
  // 浮動小数を使っていないので理論上ここには来ないが、保険で最後を返す
  return prizes[prizes.length - 1]
}

/** UTC 日付が同じか。抽選回数の日次リセットに使う。 */
function isSameUtcDay(a: Date | null, b: Date): boolean {
  if (!a) return false
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}
