import { defineConfig, env } from 'prisma/config'

// Prisma 7 không tự nạp `.env` nữa. Node 20.12+ có sẵn `loadEnvFile`, nên
// không cần thêm `dotenv` chỉ để làm mỗi việc này.
try {
  process.loadEnvFile('.env')
} catch {
  // Không có .env cũng không sao: CI truyền biến môi trường trực tiếp.
}

/**
 * Prisma 7 chuyển URL kết nối ra khỏi schema. Nhờ vậy schema chỉ còn mô tả
 * cấu trúc dữ liệu, còn chuyện nối vào SQLite hay Postgres là quyết định
 * lúc chạy — xem `src/data/db/prismaClient.ts`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
