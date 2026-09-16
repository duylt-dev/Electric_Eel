import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../generated/prisma/client'

/**
 * Điểm duy nhất tạo kết nối cơ sở dữ liệu.
 *
 * Prisma 7 nối vào DB qua "driver adapter" thay vì URL nằm trong schema. Nhờ
 * vậy loại DB là quyết định của riêng file này: muốn quay về SQLite (cho một
 * máy chủ tự quản) thì thay dòng dựng adapter ngay dưới, cộng với đổi
 * `provider` trong schema:
 *
 *     import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
 *     const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
 *
 * Không file nào khác trong dự án biết đang chạy DB nào.
 *
 * Postgres vì trang này chạy trên Vercel: mỗi request là một tiến trình có thể
 * vừa được dựng mới, đĩa chỉ đọc — một file SQLite ghi ở request này không còn
 * ở request sau. Dữ liệu phải nằm ở một máy chủ DB bên ngoài.
 */
const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error('DATABASE_URL chưa đặt. Xem `.env.example`.')
}

const createClient = (): PrismaClient =>
  new PrismaClient({
    // Serverless dựng lại tiến trình liên tục, nên pool phải nhỏ: mỗi tiến
    // trình sống ngắn mà giữ 10 kết nối thì Neon free tier hết chỗ rất nhanh.
    // Dùng chuỗi kết nối qua pooler (`-pooler` trên host của Neon) để phía DB
    // gộp lại thành ít kết nối thật.
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 3 }),
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
