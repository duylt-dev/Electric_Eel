import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  activeKeyId,
  decryptCredential,
  encryptCredential,
  isEncryptedWithActiveKey,
} from './ServiceAccountCipher'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const SAMPLE = JSON.stringify({ type: 'service_account', private_key: '-----BEGIN…', n: 'ăâđêô' })

const withKeys = (current: string, previous?: string): void => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = current
  if (previous === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS
  else process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = previous
}

afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY
  delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS
})

describe('ServiceAccountCipher', () => {
  it('mã hoá rồi giải mã cho lại đúng chuỗi ban đầu, kể cả ký tự tiếng Việt', () => {
    withKeys(KEY_A)
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)

    const decrypted = decryptCredential(encrypted.value)
    assert.ok(decrypted.ok)
    assert.equal(decrypted.value, SAMPLE)
  })

  it('bản mã mang theo định danh của khoá đã dùng', () => {
    withKeys(KEY_A)
    const keyId = activeKeyId()
    assert.ok(keyId.ok)

    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)
    assert.ok(encrypted.value.startsWith(`k${keyId.value}:`))
    assert.equal(encrypted.value.split(':').length, 4)
  })

  it('hai lần mã hoá cùng một nội dung cho hai bản mã khác nhau', () => {
    withKeys(KEY_A)
    const first = encryptCredential(SAMPLE)
    const second = encryptCredential(SAMPLE)
    assert.ok(first.ok && second.ok)
    // IV ngẫu nhiên mỗi lần. Bằng nhau nghĩa là IV bị dùng lại, và dùng lại IV
    // với GCM làm lộ nội dung.
    assert.notEqual(first.value, second.value)
  })

  it('đọc được bản mã của khoá cũ khi khoá cũ còn nằm trong PREVIOUS', () => {
    withKeys(KEY_A)
    const encryptedWithOld = encryptCredential(SAMPLE)
    assert.ok(encryptedWithOld.ok)

    // Xoay khoá: A thành khoá cũ, B thành khoá hiện hành.
    withKeys(KEY_B, KEY_A)

    const decrypted = decryptCredential(encryptedWithOld.value)
    assert.ok(decrypted.ok)
    assert.equal(decrypted.value, SAMPLE)
    assert.equal(isEncryptedWithActiveKey(encryptedWithOld.value), false)
  })

  it('báo lỗi rõ ràng khi khoá cũ đã bị gỡ khỏi cấu hình', () => {
    withKeys(KEY_A)
    const encryptedWithOld = encryptCredential(SAMPLE)
    assert.ok(encryptedWithOld.ok)

    withKeys(KEY_B)

    const decrypted = decryptCredential(encryptedWithOld.value)
    assert.ok(!decrypted.ok)
    // Nói rõ là thiếu khoá, không nói mơ hồ là dữ liệu hỏng — hai câu đó dẫn
    // người đọc đi hai hướng sửa hoàn toàn khác nhau.
    assert.match(decrypted.error.message, /không còn được cấu hình/)
  })

  it('đọc được bản mã theo định dạng cũ ba phần, không cần migration', () => {
    withKeys(KEY_A)
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)

    // Bỏ tiền tố định danh khoá đi để giả lập dữ liệu ghi trước thay đổi này.
    const legacy = encrypted.value.split(':').slice(1).join(':')
    assert.equal(legacy.split(':').length, 3)

    const decrypted = decryptCredential(legacy)
    assert.ok(decrypted.ok)
    assert.equal(decrypted.value, SAMPLE)
  })

  it('bản mã theo định dạng cũ vẫn đọc được sau khi xoay khoá', () => {
    withKeys(KEY_A)
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)
    const legacy = encrypted.value.split(':').slice(1).join(':')

    withKeys(KEY_B, KEY_A)

    const decrypted = decryptCredential(legacy)
    assert.ok(decrypted.ok)
    assert.equal(decrypted.value, SAMPLE)
  })

  it('từ chối bản mã đã bị sửa', () => {
    withKeys(KEY_A)
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)

    const parts = encrypted.value.split(':')
    const data = Buffer.from(parts[3] as string, 'base64url')
    data[0] = (data[0] as number) ^ 0xff
    parts[3] = data.toString('base64url')

    const decrypted = decryptCredential(parts.join(':'))
    assert.ok(!decrypted.ok)
  })

  it('từ chối khoá không phải 64 ký tự hex', () => {
    withKeys('khong-phai-hex')
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(!encrypted.ok)
    assert.match(encrypted.error.message, /64 ký tự hex/)
  })

  it('bỏ qua PREVIOUS khi nó trùng khoá hiện hành', () => {
    withKeys(KEY_A, KEY_A)
    const encrypted = encryptCredential(SAMPLE)
    assert.ok(encrypted.ok)
    assert.equal(isEncryptedWithActiveKey(encrypted.value), true)
  })
})
