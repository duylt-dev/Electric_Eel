import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'
import type { SqlDriverAdapterFactory } from '@prisma/client/runtime/client'

import { PrismaClient } from '../../generated/prisma/client'

/**
 * Điểm duy nhất tạo kết nối cơ sở dữ liệu.
 *
 * Hai biến thể, như debug/release của Android Studio, chọn bằng DATABASE_URL:
 *
 *   `file:./dev.db`   debug   — SQLite, `pnpm dev`. Không cần tài khoản gì,
 *                               clone về là chạy, xoá file là có DB sạch.
 *   `postgresql://…`  release — Neon, `pnpm build && pnpm start` và Vercel.
 *                               Đĩa trên Vercel chỉ đọc và mỗi request có thể
 *                               là tiến trình mới, nên dữ liệu phải ở một máy
 *                               chủ DB bên ngoài.
 *
 * Prisma 7 nối vào DB qua "driver adapter", nhưng client SINH RA vẫn gắn với
 * một provider — nên adapter ở đây phải khớp với schema mà `prisma generate`
 * vừa dùng. `prisma.config.ts` chọn schema theo cùng DATABASE_URL này, vì thế
 * hai bên luôn khớp miễn là generate và chạy cùng một biến thể (các script
 * trong package.json đã ghép sẵn). Lệch thì Prisma báo lỗi ngay lúc dựng
 * client, không âm thầm.
 *
 * Không file nào khác trong dự án biết đang chạy DB nào.
 */
const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error('DATABASE_URL chưa đặt. Xem `.env.example`.')
}

const createAdapter = (url: string): SqlDriverAdapterFactory =>
  url.startsWith('file:')
    ? new PrismaBetterSqlite3({ url })
    : // Serverless dựng lại tiến trình liên tục, nên pool phải nhỏ: mỗi tiến
      // trình sống ngắn mà giữ 10 kết nối thì Neon free tier hết chỗ rất nhanh.
      // Dùng chuỗi kết nối qua pooler (`-pooler` trên host của Neon) để phía DB
      // gộp lại thành ít kết nối thật.
      new PrismaPg({ connectionString: url, max: 3 })

const createClient = (): PrismaClient =>
  new PrismaClient({
    adapter: createAdapter(databaseUrl),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

/**
 * Next.js ở chế độ dev nạp lại module mỗi lần sửa file. Không giữ lại client
 * thì mỗi lần lưu file sinh thêm một pool kết nối, tới lúc DB hết chỗ.
 *
 * Cái giá của việc giữ lại: `globalThis` sống lâu hơn mọi lần nạp lại module,
 * nên sau khi `prisma generate` sinh thêm model thì tiến trình dev vẫn đang cầm
 * thể hiện CŨ — thể hiện không biết model mới. Triệu chứng đúng là bảng cũ chạy
 * bình thường còn bảng vừa thêm thì hỏng, và không lần sửa file nào chữa được.
 * Cách chữa duy nhất là khởi động lại `pnpm dev`.
 */
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prismaClient ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaClient = prisma
