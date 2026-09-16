import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig, env } from 'prisma/config'

// Prisma 7 không tự nạp `.env` nữa. Import này nạp đúng bộ file theo biến thể
// để `prisma generate` / `db push` thấy cùng DATABASE_URL mà Next sẽ thấy.
import { isSqliteUrl } from './scripts/load-env'

/**
 * Schema chỉ có MỘT bản gốc (`prisma/schema.prisma`, provider = postgresql).
 * Prisma không cho đặt `provider` bằng biến môi trường, còn client sinh ra thì
 * gắn chặt với provider — nên biến thể debug (SQLite) được suy ra bằng cách
 * chép schema gốc, đổi đúng dòng provider, và trỏ CLI vào bản chép đó.
 * Bản chép nằm cạnh bản gốc để `output = "../src/generated/prisma"` vẫn đúng,
 * và bị gitignore.
 */
const SOURCE_SCHEMA = 'prisma/schema.prisma'
const SQLITE_SCHEMA = 'prisma/schema.sqlite.prisma'

const schemaFor = (databaseUrl: string): string => {
  if (!isSqliteUrl(databaseUrl)) return SOURCE_SCHEMA

  const source = readFileSync(SOURCE_SCHEMA, 'utf8')
  const derived = source.replace('provider = "postgresql"', 'provider = "sqlite"')
  if (derived === source) {
    throw new Error(`${SOURCE_SCHEMA}: không thấy dòng provider = "postgresql" để đổi sang sqlite.`)
  }
  writeFileSync(
    SQLITE_SCHEMA,
    `// SINH TỰ ĐỘNG từ schema.prisma bởi prisma.config.ts — đừng sửa tay.\n${derived}`,
  )
  return SQLITE_SCHEMA
}

const databaseUrl = env('DATABASE_URL')

export default defineConfig({
  schema: schemaFor(databaseUrl),
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
