/**
 * Xoay khoá mã hoá cho MỌI bản mã trong cơ sở dữ liệu.
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
 *
 * Hiện có HAI bảng giữ bản mã, và cả hai đều phải được chạm:
 *
 *   · `FirebaseApp.credentialCiphertext`   — service account của Firebase.
 *   · `UserLlmCredential.apiKeyCiphertext` — khoá OpenAI/Gemini của từng người.
 *
 * Thêm một bảng có bản mã mà quên thêm vào đây thì lần xoay khoá kế tiếp biến
 * bảng đó thành rác, và điều đó chỉ lộ ra vào lần dùng tiếp theo — có khi là
 * vài tuần sau.
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

  const failures: string[] = []
  const apps = await prisma.firebaseApp.findMany({
    where: { credentialCiphertext: { not: null } },
    select: { id: true, slug: true, displayName: true, credentialCiphertext: true },
    orderBy: { slug: 'asc' },
  })

  let rotated = 0
  let skipped = 0

  if (apps.length === 0) {
    console.log('Không có app nào đang giữ service account.')
  }

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

  // ── Khoá LLM của từng người dùng ──
  const credentials = await prisma.userLlmCredential.findMany({
    select: { id: true, provider: true, apiKeyCiphertext: true, user: { select: { email: true } } },
    orderBy: [{ userId: 'asc' }, { provider: 'asc' }],
  })

  if (credentials.length === 0) {
    console.log('Không có khoá API mô hình nào đang lưu.')
  }

  for (const credential of credentials) {
    // Nhãn dùng email chứ không dùng id: khi một hàng hỏng, người chạy script
    // cần biết phải báo cho ai gắn lại khoá, và id không nói với họ điều gì.
    const label = `${credential.user?.email ?? credential.id} · ${credential.provider}`

    if (isEncryptedWithActiveKey(credential.apiKeyCiphertext)) {
      console.log(`  = ${label} — đã dùng khoá hiện hành`)
      skipped += 1
      continue
    }

    const plaintext = decryptCredential(credential.apiKeyCiphertext)
    if (!plaintext.ok) {
      console.error(`  ✗ ${label} — ${plaintext.error.message}`)
      failures.push(label)
      continue
    }

    const reencrypted = encryptCredential(plaintext.value)
    if (!reencrypted.ok) {
      console.error(`  ✗ ${label} — ${reencrypted.error.message}`)
      failures.push(label)
      continue
    }

    await prisma.userLlmCredential.update({
      where: { id: credential.id },
      data: { apiKeyCiphertext: reencrypted.value },
    })
    console.log(`  ✓ ${label} — đã mã hoá lại`)
    rotated += 1
  }

  console.log(`\nXong: ${rotated} đã xoay, ${skipped} bỏ qua, ${failures.length} hỏng.`)

  if (failures.length > 0) {
    throw new Error(
      `Không xoay được: ${failures.join(', ')}.\n` +
        'Nhiều khả năng khoá cũ của chúng không nằm trong CREDENTIAL_ENCRYPTION_KEY_PREVIOUS. ' +
        'Đặt đúng khoá cũ rồi chạy lại — script bỏ qua những hàng đã xong nên chạy lại là an toàn.\n' +
        'Riêng khoá API mô hình thì gắn lại ở trang /translations cũng xong.',
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
