import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inflateRawSync } from 'node:zlib'

import { buildZipArchive } from './ZipArchive'

const EOCD_SIGNATURE = 0x06054b50
const LOCAL_SIGNATURE = 0x04034b50

/**
 * Giải nén lại tệp zip vừa dựng.
 *
 * Kiểm bằng cách ĐỌC NGƯỢC chứ không so với một chuỗi byte chép sẵn: một bản
 * chép sẵn chỉ chứng minh mã không đổi, còn đọc ngược chứng minh tệp đúng định
 * dạng — đó mới là thứ `unzip` và Android Studio sẽ làm với nó.
 */
function readZip(zip: Buffer): Map<string, string> {
  const eocd = zip.length - 22
  assert.equal(zip.readUInt32LE(eocd), EOCD_SIGNATURE, 'thiếu End Of Central Directory')

  const total = zip.readUInt16LE(eocd + 10)
  let cursor = zip.readUInt32LE(eocd + 16)
  const entries = new Map<string, string>()

  for (let index = 0; index < total; index += 1) {
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength)

    assert.equal(zip.readUInt32LE(localOffset), LOCAL_SIGNATURE, `local header hỏng ở ${name}`)
    const localNameLength = zip.readUInt16LE(localOffset + 26)
    const localExtraLength = zip.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength

    entries.set(
      name,
      inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize)).toString('utf8'),
    )
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

describe('buildZipArchive', () => {
  it('gói và giải nén lại ra đúng nội dung ban đầu', () => {
    const entries = [
      { path: 'values-vi/strings.xml', content: '<resources><string name="a">Xin chào</string></resources>' },
      { path: 'values-ja/strings.xml', content: '<resources><string name="a">こんにちは</string></resources>' },
    ]

    const read = readZip(buildZipArchive(entries))

    assert.equal(read.size, 2)
    for (const entry of entries) {
      assert.equal(read.get(entry.path), entry.content)
    }
  })

  it('giữ nguyên emoji và ký tự ngoài ASCII', () => {
    const content = '<resources><string name="a">Deal 🔥 &#x1F4B0; Ả Rập</string></resources>'
    const read = readZip(buildZipArchive([{ path: 'values-ar/strings.xml', content }]))
    assert.equal(read.get('values-ar/strings.xml'), content)
  })

  it('nén thật — tệp XML lặp lại phải nhỏ đi rõ rệt', () => {
    const content = `<resources>${'<string name="a">Hello</string>'.repeat(500)}</resources>`
    const zip = buildZipArchive([{ path: 'values-vi/strings.xml', content }])

    assert.ok(zip.byteLength < Buffer.byteLength(content) / 4, `zip ${zip.byteLength} B chưa nén`)
    assert.equal(readZip(zip).get('values-vi/strings.xml'), content)
  })

  it('dựng được tệp zip rỗng hợp lệ', () => {
    const zip = buildZipArchive([])
    assert.equal(zip.byteLength, 22)
    assert.equal(readZip(zip).size, 0)
  })

  it('xử lý được cả 28 thư mục của một lượt dịch đầy đủ', () => {
    const entries = Array.from({ length: 28 }, (_, index) => ({
      path: `values-l${index}/strings.xml`,
      content: `<resources><string name="a">value ${index}</string></resources>`,
    }))

    const read = readZip(buildZipArchive(entries))
    assert.equal(read.size, 28)
    assert.equal(read.get('values-l27/strings.xml'), '<resources><string name="a">value 27</string></resources>')
  })
})
