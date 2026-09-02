import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Mã hoá service account trước khi ghi xuống DB.
 *
 * AES-256-GCM: vừa giấu nội dung, vừa phát hiện được nếu bản mã bị sửa.
 *
 * Khoá nằm ở biến môi trường và không bao giờ ghi vào DB — mất DB mà không mất
 * khoá thì credential vẫn an toàn.
 *
 * ## Vì sao bản mã mang theo định danh khoá
 *
 * Chuỗi lưu xuống có dạng `k<keyId>:iv:tag:ciphertext`, tất cả base64url trừ
 * `keyId`. `keyId` là 8 ký tự hex đầu của SHA-256 của chính khoá.
 *
 * Suy định danh từ khoá, thay vì đánh số phiên bản bằng tay, có ba cái lợi mà
 * mỗi cái đều đủ để chọn cách này:
 *
 *   1. Không cần bảng ghi "hàng nào mã bằng khoá nào" — hỏi bản mã là biết.
 *   2. Không cần migration cho những hàng đã ghi theo định dạng cũ ba phần:
 *      chúng thử lần lượt các khoá đang cấu hình.
 *   3. Đặt nhầm khoá thì báo lỗi ngay và nói rõ, thay vì để GCM báo "sai thẻ
 *      xác thực" — thông báo khiến người ta đi tìm dữ liệu hỏng.
 *
 * ## Xoay khoá
 *
 * Đặt khoá cũ vào `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS`, khoá mới vào
 * `CREDENTIAL_ENCRYPTION_KEY`, rồi chạy `pnpm rotate:key`. Trong lúc chạy, hệ
 * thống vẫn đọc được cả bản mã cũ lẫn mới. Xong thì bỏ biến PREVIOUS đi.
 *
 * Ghi thì LUÔN dùng khoá hiện hành; khoá cũ chỉ để đọc.
 */
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32
const KEY_ID_LENGTH = 8

const CURRENT_KEY_ENV = 'CREDENTIAL_ENCRYPTION_KEY'
const PREVIOUS_KEY_ENV = 'CREDENTIAL_ENCRYPTION_KEY_PREVIOUS'

export interface CipherKey {
  readonly id: string
  readonly bytes: Buffer
}

/** Định danh khoá: 8 hex đầu của SHA-256(khoá). Không tiết lộ gì về khoá. */
const keyIdOf = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, KEY_ID_LENGTH)

const parseKey = (hex: string, envName: string): Result<CipherKey> => {
  const trimmed = hex.trim()
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return err(
      AppErrors.unknown(`${envName} phải là 64 ký tự hex (khoá AES-256).`, {
        detail: 'Sinh khoá bằng: openssl rand -hex 32',
      }),
    )
  }
  const bytes = Buffer.from(trimmed, 'hex')
  if (bytes.length !== KEY_LENGTH) {
    return err(AppErrors.unknown(`${envName} phải là 64 ký tự hex (khoá AES-256).`))
  }
  return ok({ id: keyIdOf(bytes), bytes })
}

interface KeyRing {
  /** Khoá dùng để ghi. */
  readonly current: CipherKey
  /** Khoá cũ, chỉ dùng để đọc trong lúc xoay khoá. */
  readonly previous: CipherKey | null
}

const readKeyRing = (): Result<KeyRing> => {
  const currentHex = process.env[CURRENT_KEY_ENV]
  if (currentHex === undefined || currentHex.trim().length === 0) {
    return err(
      AppErrors.unknown(`Chưa cấu hình ${CURRENT_KEY_ENV} nên không lưu được service account.`, {
        detail: 'Sinh khoá bằng: openssl rand -hex 32',
      }),
    )
  }

  const current = parseKey(currentHex, CURRENT_KEY_ENV)
  if (!current.ok) return current

  const previousHex = process.env[PREVIOUS_KEY_ENV]
  if (previousHex === undefined || previousHex.trim().length === 0) {
    return ok({ current: current.value, previous: null })
  }

  const previous = parseKey(previousHex, PREVIOUS_KEY_ENV)
  if (!previous.ok) return previous

  // Đặt hai biến bằng nhau không phải lỗi, nhưng cũng không có tác dụng gì.
  if (previous.value.id === current.value.id) {
    return ok({ current: current.value, previous: null })
  }

  return ok({ current: current.value, previous: previous.value })
}

/** Định danh của khoá đang dùng để ghi. Script xoay khoá cần biết để bỏ qua hàng đã xong. */
export function activeKeyId(): Result<string> {
  const ring = readKeyRing()
  return ring.ok ? ok(ring.value.current.id) : ring
}

/** Kiểm tra cấu hình khoá mà không mã hoá gì — dùng lúc khởi động. */
export function assertCipherConfigured(): Result<void> {
  const ring = readKeyRing()
  return ring.ok ? ok(undefined) : ring
}

export function encryptCredential(plaintext: string): Result<string> {
  const ring = readKeyRing()
  if (!ring.ok) return ring

  const { current } = ring.value
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, current.bytes, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return ok(
    [
      `k${current.id}`,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':'),
  )
}

interface ParsedCipherText {
  /** null với định dạng cũ ba phần, khi bản mã không nói nó dùng khoá nào. */
  readonly keyId: string | null
  readonly iv: Buffer
  readonly tag: Buffer
  readonly data: Buffer
}

const parseEncoded = (encoded: string): Result<ParsedCipherText> => {
  const parts = encoded.split(':')

  if (parts.length === 4 && parts[0]?.startsWith('k') === true) {
    const [prefix, iv, tag, data] = parts as [string, string, string, string]
    return ok({
      keyId: prefix.slice(1),
      iv: Buffer.from(iv, 'base64url'),
      tag: Buffer.from(tag, 'base64url'),
      data: Buffer.from(data, 'base64url'),
    })
  }

  // Định dạng cũ, ghi trước khi bản mã mang theo định danh khoá.
  if (parts.length === 3) {
    const [iv, tag, data] = parts as [string, string, string]
    return ok({
      keyId: null,
      iv: Buffer.from(iv, 'base64url'),
      tag: Buffer.from(tag, 'base64url'),
      data: Buffer.from(data, 'base64url'),
    })
  }

  return err(AppErrors.unknown('Bản mã service account sai định dạng.'))
}

const tryDecrypt = (parsed: ParsedCipherText, key: CipherKey): string | null => {
  try {
    const decipher = createDecipheriv(ALGORITHM, key.bytes, parsed.iv)
    decipher.setAuthTag(parsed.tag)
    return Buffer.concat([decipher.update(parsed.data), decipher.final()]).toString('utf8')
  } catch {
    // Thẻ xác thực không khớp: hoặc sai khoá, hoặc bản mã bị sửa. Phía gọi
    // phân biệt được nhờ đã thử hết các khoá đang cấu hình.
    return null
  }
}

const sameKeyId = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function decryptCredential(encoded: string): Result<string> {
  const ring = readKeyRing()
  if (!ring.ok) return ring

  const parsed = parseEncoded(encoded)
  if (!parsed.ok) return parsed

  const { current, previous } = ring.value
  const candidates: CipherKey[] =
    parsed.value.keyId === null
      ? // Định dạng cũ không nói khoá nào, nên thử lần lượt.
        previous === null
        ? [current]
        : [current, previous]
      : [current, ...(previous === null ? [] : [previous])].filter((key) =>
          sameKeyId(key.id, parsed.value.keyId as string),
        )

  if (candidates.length === 0) {
    const configured = [current.id, ...(previous === null ? [] : [previous.id])].join(', ')
    return err(
      AppErrors.unknown(
        `Bản mã này được mã hoá bằng khoá "${parsed.value.keyId}", mà khoá đó không còn được cấu hình.`,
        {
          detail: `Khoá đang cấu hình: ${configured}. Đặt khoá cũ vào ${PREVIOUS_KEY_ENV} rồi chạy "pnpm rotate:key".`,
        },
      ),
    )
  }

  for (const key of candidates) {
    const plaintext = tryDecrypt(parsed.value, key)
    if (plaintext !== null) return ok(plaintext)
  }

  return err(
    AppErrors.unknown(
      'Không giải mã được service account. Nhiều khả năng khoá mã hoá đã thay đổi.',
      { detail: `Đã thử ${candidates.length} khoá đang cấu hình, không khoá nào khớp.` },
    ),
  )
}

/** Bản mã này đã dùng khoá hiện hành chưa? Script xoay khoá dùng để bỏ qua hàng đã xong. */
export function isEncryptedWithActiveKey(encoded: string): boolean {
  const ring = readKeyRing()
  if (!ring.ok) return false
  const parsed = parseEncoded(encoded)
  if (!parsed.ok) return false
  return parsed.value.keyId !== null && parsed.value.keyId === ring.value.current.id
}
