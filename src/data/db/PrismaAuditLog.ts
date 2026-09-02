import { type Result, attemptAsync } from '../../core/result'
import type {
  AuditAction,
  AuditEntry,
  AuditLogRepository,
} from '../../domain/identity/repositories/AuditLogRepository'
import { prisma } from './prismaClient'

const asAction = (value: string): AuditAction => value as AuditAction

export class PrismaAuditLog implements AuditLogRepository {
  async record(entry: {
    action: AuditAction
    userId?: string | null
    appId?: string | null
    targetKey?: string | null
    detail?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    succeeded?: boolean
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          appId: entry.appId ?? null,
          targetKey: entry.targetKey ?? null,
          detailJson: entry.detail ?? null,
          ipAddress: entry.ipAddress ?? null,
          // User-Agent do trình duyệt gửi và không bị giới hạn độ dài; cắt bớt
          // để một header dài bất thường không phình cột log.
          userAgent: entry.userAgent?.slice(0, 400) ?? null,
          succeeded: entry.succeeded ?? true,
        },
      })
    } catch (thrown) {
      // Ghi log hỏng thì thao tác chính vẫn phải tính là thành công. Người dùng
      // đã publish xong rồi; báo lỗi ở đây chỉ khiến họ bấm publish lần nữa.
      console.error('[audit] không ghi được nhật ký:', thrown)
    }
  }

  async list(filter: { appId?: string; userId?: string; limit?: number }): Promise<Result<AuditEntry[]>> {
    return attemptAsync(async () => {
      const rows = await prisma.auditLog.findMany({
        where: {
          ...(filter.appId !== undefined ? { appId: filter.appId } : {}),
          ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
        },
        include: { user: true, app: true },
        orderBy: { createdAt: 'desc' },
        take: filter.limit ?? 100,
      })

      return rows.map<AuditEntry>((row) => ({
        id: row.id,
        action: asAction(row.action),
        userId: row.userId,
        userName: row.user?.name ?? null,
        appId: row.appId,
        appSlug: row.app?.slug ?? null,
        targetKey: row.targetKey,
        detail: row.detailJson,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        succeeded: row.succeeded,
        createdAt: row.createdAt,
      }))
    }, 'Không đọc được nhật ký thao tác.')
  }
}
