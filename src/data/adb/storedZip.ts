import { crc32 } from 'node:zlib'

/**
 * Ghép vài tệp thành một zip KHÔNG NÉN, đủ để `aapt2 dump badging` đọc.
 *
 * Vì sao tự viết thay vì gọi `zip`: máy chủ chắc chắn có Node, không chắc có
 * `zip` (Linux tối giản không có). Còn vì sao không nén: hai tệp đưa vào là
 * `AndroidManifest.xml` và `resources.arsc`, aapt2 đọc xong là vứt; nén chỉ
 * tốn CPU cho một tệp sống vài trăm mili giây.
 *
 * Định dạng: [local header + dữ liệu]* [central directory]* [end record].
 * Mọi trường ngày giờ để 0 — aapt2 không đọc chúng.
 */
export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_RECORD = 0x06054b50

export function buildStoredZip(entries: readonly ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const checksum = crc32(entry.data)
    const size = entry.data.byteLength

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_HEADER, 0)
    local.writeUInt16LE(20, 4) // phiên bản cần để giải nén
    local.writeUInt16LE(0, 6) // cờ
    local.writeUInt16LE(0, 8) // phương pháp: 0 = stored
    local.writeUInt32LE(0, 10) // giờ + ngày
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)

    const record = Buffer.alloc(46)
    record.writeUInt32LE(CENTRAL_HEADER, 0)
    record.writeUInt16LE(20, 4) // phiên bản tạo
    record.writeUInt16LE(20, 6) // phiên bản cần
    record.writeUInt16LE(0, 8)
    record.writeUInt16LE(0, 10)
    record.writeUInt32LE(0, 12)
    record.writeUInt32LE(checksum, 16)
    record.writeUInt32LE(size, 20)
    record.writeUInt32LE(size, 24)
    record.writeUInt16LE(name.byteLength, 28)
    record.writeUInt16LE(0, 30) // extra
    record.writeUInt16LE(0, 32) // comment
    record.writeUInt16LE(0, 34) // đĩa
    record.writeUInt16LE(0, 36) // thuộc tính trong
    record.writeUInt32LE(0, 38) // thuộc tính ngoài
    record.writeUInt32LE(offset, 42)

    parts.push(local, name, Buffer.from(entry.data))
    central.push(record, name)
    offset += local.byteLength + name.byteLength + size
  }

  const centralSize = central.reduce((total, part) => total + part.byteLength, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_RECORD, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, ...central, end])
}
