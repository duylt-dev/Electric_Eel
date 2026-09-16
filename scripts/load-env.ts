/**
 * Nạp `.env*` cho các tiến trình KHÔNG đi qua Next: CLI `prisma`, seed,
 * xoay khoá. Chính Next tự nạp đúng bộ này khi `next dev` / `next build`.
 *
 * Hai "biến thể" như debug/release của Android Studio, chọn bằng NODE_ENV:
 *
 *   (không đặt) / development  →  .env.development   →  SQLite `dev.db`
 *   production                 →  .env.production    →  PostgreSQL (Neon)
 *
 * Thứ tự ưu tiên đúng như Next: biến đã có sẵn trong môi trường thắng tất
 * cả, rồi `.env.<variant>.local`, `.env.local`, `.env.<variant>`, `.env`.
 * `process.loadEnvFile` không ghi đè biến đã có, nên nạp file ưu tiên cao
 * TRƯỚC là ra đúng thứ tự đó.
 *
 * Nạp NGAY KHI IMPORT, có chủ ý: `prismaClient.ts` đọc DATABASE_URL lúc nạp
 * module, mà ESM đánh giá mọi `import` trước phần thân file — gọi hàm ở thân
 * là quá muộn. Vì thế ở seed/script phải đặt `import './load-env'` làm dòng
 * import ĐẦU TIÊN.
 */
export type EnvVariant = 'development' | 'production'

export function resolveVariant(env: NodeJS.ProcessEnv = process.env): EnvVariant {
  return env.NODE_ENV === 'production' ? 'production' : 'development'
}

const load = (path: string): void => {
  try {
    process.loadEnvFile(path)
  } catch {
    // Thiếu file thì thôi: CI và Vercel truyền biến môi trường trực tiếp.
  }
}

const loadEnv = (variant: EnvVariant): void => {
  for (const path of [`.env.${variant}.local`, '.env.local', `.env.${variant}`, '.env']) {
    load(path)
  }
}

/** Biến thể đang chạy, sau khi đã nạp xong bộ `.env*` tương ứng. */
export const variant: EnvVariant = resolveVariant()
loadEnv(variant)

/** `file:` là SQLite; còn lại là chuỗi Postgres. Quyết định adapter và provider. */
export const isSqliteUrl = (url: string): boolean => url.startsWith('file:')
