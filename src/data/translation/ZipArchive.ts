import { deflateRawSync } from 'node:zlib'

/**
 * Gói vài chục tệp văn bản thành một tệp zip.
 *
 * ─── Vì sao tự viết thay vì thêm một thư viện ───
 *
 * Cái cần ở đây là tập con nhỏ nhất của định dạng zip: nhiều tệp, một mức nén,
 * không mật khẩu, không zip64, không đọc lại. Phần đó là khoảng trăm dòng và
 * đã đứng yên từ năm 1989. Một thư viện zip đầy đủ mang theo phần đọc, phần
 * mã hoá và phần luồng — toàn thứ không dùng tới, nhưng vẫn phải theo dõi lỗ
 * hổng và vẫn nằm trong `pnpm-lock.yaml`.
 *
 * Dự án này đã chọn cùng một cách với DI và với client Firebase: viết đúng
 * phần mình cần, và viết ra để đọc được.
 *
 * Định dạng, theo APPNOTE.TXT của PKWARE:
 *
 *   [local header + dữ liệu nén] × n  →  [central directory] × n  →  [EOCD]
 *
 * Chỉ chạy trên máy chủ: `node:zlib` không có trong trình duyệt. Route Handler
 * là nơi duy nhất import tệp này.
 */
export interface ArchiveEntry {
  /** Đường dẫn trong tệp zip, dùng `/`. Ví dụ `values-vi/strings.xml`. */
  readonly path: string
  readonly content: string
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50

/** Cờ bit 11: tên tệp mã hoá UTF-8. Không có nó thì `values-中文` ra rác. */
const FLAG_UTF8 = 0x0800
const METHOD_DEFLATE = 8
const VERSION_NEEDED = 20

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Giờ và ngày kiểu MS-DOS: giây chia đôi, năm đếm từ 1980. */
const dosTime = (at: Date): number =>
  (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2)

const dosDate = (at: Date): number =>
  ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()

interface StagedEntry {
  readonly name: Buffer
  readonly deflated: Buffer
  readonly crc: number
  readonly rawLength: number
  readonly offset: number
}

export function buildZipArchive(entries: readonly ArchiveEntry[], at: Date = new Date()): Buffer {
  const time = dosTime(at)
  const date = dosDate(at)

  const parts: Buffer[] = []
  const staged: StagedEntry[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8')
    const raw = Buffer.from(entry.content, 'utf8')
    const deflated = deflateRawSync(raw)
    const crc = crc32(raw)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(LOCAL_HEADER, 0)
    header.writeUInt16LE(VERSION_NEEDED, 4)
    header.writeUInt16LE(FLAG_UTF8, 6)
    header.writeUInt16LE(METHOD_DEFLATE, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(deflated.length, 18)
    header.writeUInt32LE(raw.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)

    parts.push(header, name, deflated)
    staged.push({ name, deflated, crc, rawLength: raw.length, offset })
    offset += header.length + name.length + deflated.length
  }

  const directoryOffset = offset
  let directorySize = 0

  for (const entry of staged) {
    const record = Buffer.alloc(46)
    record.writeUInt32LE(CENTRAL_HEADER, 0)
    record.writeUInt16LE(VERSION_NEEDED, 4)
    record.writeUInt16LE(VERSION_NEEDED, 6)
    record.writeUInt16LE(FLAG_UTF8, 8)
    record.writeUInt16LE(METHOD_DEFLATE, 10)
    record.writeUInt16LE(time, 12)
    record.writeUInt16LE(date, 14)
    record.writeUInt32LE(entry.crc, 16)
    record.writeUInt32LE(entry.deflated.length, 20)
    record.writeUInt32LE(entry.rawLength, 24)
    record.writeUInt16LE(entry.name.length, 28)
    record.writeUInt16LE(0, 30) // extra
    record.writeUInt16LE(0, 32) // comment
    record.writeUInt16LE(0, 34) // đĩa chứa
    record.writeUInt16LE(0, 36) // thuộc tính trong
    // 0o644 << 16: quyền đọc-ghi cho chủ, chỉ đọc cho phần còn lại. Không có
    // trường này thì bản giải nén trên macOS/Linux ra tệp không có quyền đọc.
    record.writeUInt32LE((0o644 << 16) >>> 0, 38)
    record.writeUInt32LE(entry.offset, 42)

    parts.push(record, entry.name)
    directorySize += record.length + entry.name.length
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0)
  end.writeUInt16LE(0, 4) // số hiệu đĩa
  end.writeUInt16LE(0, 6) // đĩa chứa central directory
  end.writeUInt16LE(staged.length, 8)
  end.writeUInt16LE(staged.length, 10)
  end.writeUInt32LE(directorySize, 12)
  end.writeUInt32LE(directoryOffset, 16)
  end.writeUInt16LE(0, 20) // chú thích
  parts.push(end)

  return Buffer.concat(parts)
}
