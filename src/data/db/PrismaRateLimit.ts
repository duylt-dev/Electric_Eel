import { type Result, attemptAsync, ok } from '../../core/result'
import {
  RATE_LIMIT_RETENTION_SECONDS,
  type RateLimitRule,
  type RateLimitVerdict,
  judge,
} from '../../domain/identity/entities/RateLimitPolicy'
import type { RateLimitRepository } from '../../domain/identity/repositories/RateLimitRepository'
import { prisma } from './prismaClient'

/**
 * Bộ đếm nhịp trên Prisma.
 *
 * Lưu từng lần hỏng thành một hàng, rồi đếm, thay vì giữ một hàng bộ đếm và
 * tăng dần. Bộ đếm tăng dần cần đọc-sửa-ghi, mà hai request đồng thời sẽ ghi
 * đè nhau và cấp thêm lượt cho đúng kẻ đang gửi request đồng thời. Thêm hàng
 * thì không có tranh chấp nào để thua.
 *
 * Cái giá là phải dọn rác, và việc dọn làm ngay trong lúc ghi — xem `sweep`.
 */
export class PrismaRateLimit implements RateLimitRepository {
  async check(bucket: string, rule: RateLimitRule): Promise<Result<RateLimitVerdict>> {
    return attemptAsync(async () => {
      const since = new Date(Date.now() - rule.windowSeconds * 1000)

      const [hitCount, oldest] = await Promise.all([
        prisma.rateLimitHit.count({ where: { bucket, createdAt: { gte: since } } }),
        prisma.rateLimitHit.findFirst({
          where: { bucket, createdAt: { gte: since } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ])

      return judge(rule, hitCount, oldest?.createdAt ?? null)
    }, 'Không kiểm tra được hạn mức đăng nhập.')
  }

  async recordFailure(bucket: string): Promise<void> {
    try {
      await prisma.rateLimitHit.create({ data: { bucket } })
      await this.sweep()
    } catch (thrown) {
      // Ghi hỏng thì hạn mức lỏng đi một lần, còn ném lỗi ra thì màn đăng nhập
      // gãy hẳn. Lỏng một lần là cái giá nhẹ hơn.
      console.error('[rate-limit] không ghi được lần hỏng:', thrown)
    }
  }

  async clear(bucket: string): Promise<void> {
    try {
      await prisma.rateLimitHit.deleteMany({ where: { bucket } })
    } catch (thrown) {
      console.error('[rate-limit] không xoá được bộ đếm:', thrown)
    }
  }

  /**
   * Dọn bản ghi đã quá hạn giữ.
   *
   * Chạy kèm lúc ghi chứ không đặt lịch riêng: bảng này chỉ lớn lên khi có
   * người gõ sai mật khẩu, nên đúng lúc đó là lúc đáng dọn. Một tác vụ nền
   * riêng lại là một thứ nữa phải chạy đúng ở mọi môi trường.
   */
  private async sweep(): Promise<Result<void>> {
    const cutoff = new Date(Date.now() - RATE_LIMIT_RETENTION_SECONDS * 1000)
    const swept = await attemptAsync(() =>
      prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    )
    return swept.ok ? ok(undefined) : swept
  }
}
