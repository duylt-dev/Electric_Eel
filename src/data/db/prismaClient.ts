import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../../generated/prisma/client'

/**
 * Điểm duy nhất tạo kết nối cơ sở dữ liệu.
 *
 * Prisma 7 nối vào DB qua "driver adapter" thay vì URL nằm trong schema. Nghe
 * thì phiền hơn, nhưng đổi lại việc chuyển SQLite → PostgreSQL chỉ là thay
 * dòng dựng adapter ngay dưới đây, cộng với đổi `provider` trong schema:
 *
 *     import { PrismaPg } from '@prisma/adapter-pg'
 *     const adapter = new PrismaPg({ connectionString: databaseUrl })
 *
 * Không file nào khác trong dự án biết đang chạy DB nào.
 */
const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db'

const createClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
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
