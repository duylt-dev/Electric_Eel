/**
 * Xoay khoá mã hoá service account.
 *
 * Cách dùng:
 *
 *   1. Sinh khoá mới:      openssl rand -hex 32
 *   2. Trong `.env`:       CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = khoá đang dùng
 *                          CREDENTIAL_ENCRYPTION_KEY          = khoá mới
 *   3. Chạy:               pnpm rotate:key
 *   4. Xong thì XOÁ dòng CREDENTIAL_ENCRYPTION_KEY_PREVIOUS đi.
 *
 * Trong lúc chạy, ứng dụng vẫn đọc được cả bản mã cũ lẫn mới, nên không cần
 * dừng dịch vụ. Bước 4 quan trọng: để khoá cũ nằm lại nghĩa là một bản sao DB
 * rò ra ngoài vẫn giải mã được bằng khoá đã đáng lẽ bị loại.
 *
 * Script này gọi ĐÚNG hàm mã hoá mà ứng dụng dùng. Viết lại phép mã hoá ở đây
 * cho gọn là cách chắc chắn nhất để hai bên lệch nhau, và lần lệch đầu tiên sẽ
 * biến toàn bộ credential thành rác không đọc lại được.
 */
import { prisma } from '../src/data/db/prismaClient'
import {
  activeKeyId,
  decryptCredential,
  encryptCredential,
  isEncryptedWithActiveKey,
} from '../src/data/remote-config/ServiceAccountCipher'

async function main(): Promise<void> {
  const keyId = activeKeyId()
  if (!keyId.ok) {
    throw new Error(`${keyId.error.message}${keyId.error.detail === undefined ? '' : `\n${keyId.error.detail}`}`)
  }

  console.log(`Khoá hiện hành: ${keyId.value}`)

  const apps = await prisma.firebaseApp.findMany({
    where: { credentialCiphertext: { not: null } },
    select: { id: true, slug: true, displayName: true, credentialCiphertext: true },
    orderBy: { slug: 'asc' },
  })

  if (apps.length === 0) {
    console.log('Không có app nào đang giữ service account. Không cần làm gì.')
    return
  }

  let rotated = 0
  let skipped = 0
  const failures: string[] = []

  for (const app of apps) {
    const ciphertext = app.credentialCiphertext
    if (ciphertext === null) continue

    if (isEncryptedWithActiveKey(ciphertext)) {
      console.log(`  = ${app.slug} — đã dùng khoá hiện hành`)
      skipped += 1
      continue
    }

    const plaintext = decryptCredential(ciphertext)
    if (!plaintext.ok) {
      // Không dừng cả lượt chạy vì một app hỏng: những app còn lại vẫn xoay
      // được, và dừng giữa chừng để lại một cơ sở dữ liệu nửa cũ nửa mới mà
      // không ai biết đã tới đâu.
      console.error(`  ✗ ${app.slug} — ${plaintext.error.message}`)
      failures.push(app.slug)
      continue
    }

    const reencrypted = encryptCredential(plaintext.value)
    if (!reencrypted.ok) {
      console.error(`  ✗ ${app.slug} — ${reencrypted.error.message}`)
      failures.push(app.slug)
      continue
    }

    await prisma.firebaseApp.update({
      where: { id: app.id },
      data: { credentialCiphertext: reencrypted.value },
    })
    console.log(`  ✓ ${app.slug} — đã mã hoá lại`)
    rotated += 1
  }

  console.log(`\nXong: ${rotated} đã xoay, ${skipped} bỏ qua, ${failures.length} hỏng.`)

  if (failures.length > 0) {
    throw new Error(
      `Không xoay được: ${failures.join(', ')}.\n` +
        'Nhiều khả năng khoá cũ của chúng không nằm trong CREDENTIAL_ENCRYPTION_KEY_PREVIOUS. ' +
        'Đặt đúng khoá cũ rồi chạy lại — script bỏ qua những app đã xong nên chạy lại là an toàn.',
    )
  }

  console.log('Giờ xoá dòng CREDENTIAL_ENCRYPTION_KEY_PREVIOUS khỏi .env.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (thrown: unknown) => {
    console.error(`\n${thrown instanceof Error ? thrown.message : String(thrown)}`)
    await prisma.$disconnect()
    process.exitCode = 1
  })
