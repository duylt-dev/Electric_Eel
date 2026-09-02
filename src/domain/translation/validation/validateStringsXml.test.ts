import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateStringsXml } from './validateStringsXml'

const codes = (xml: string): string[] =>
  validateStringsXml(xml).findings.map((finding) => finding.code)

const VALID = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name" translatable="false">BloodSugar</string>
    <string name="hello">Hello</string>
    <string name="bye">Goodbye</string>
</resources>`

describe('validateStringsXml', () => {
  it('nhận tệp hợp lệ và đếm đúng số chuỗi sẽ dịch', () => {
    const report = validateStringsXml(VALID)

    assert.equal(report.acceptable, true)
    assert.equal(report.translatableCount, 2, 'app_name bị loại nên chỉ còn 2')
    assert.equal(report.nonTranslatableCount, 1)
    assert.ok(report.chunkCount >= 1)
  })

  it('chặn tệp rỗng', () => {
    assert.equal(validateStringsXml('   ').acceptable, false)
    assert.ok(codes('   ').includes('EMPTY_FILE'))
  })

  it('chặn tệp không phải strings.xml', () => {
    assert.ok(codes('{"a": 1}').includes('NO_RESOURCES_ROOT'))
  })

  it('chặn tệp bị cắt cụt', () => {
    assert.ok(codes('<resources>\n<string name="a">A</string>').includes('UNCLOSED_RESOURCES'))
  })

  it('chặn trùng tên — Android biên dịch hỏng vì nó', () => {
    const found = codes(`<resources>
    <string name="a">A</string>
    <string name="a">B</string>
</resources>`)
    assert.ok(found.includes('DUPLICATE_NAME'))
  })

  it('chặn dấu & thô nhưng chấp nhận thực thể', () => {
    assert.ok(codes('<resources><string name="a">Tom & Jerry</string></resources>').includes('RAW_AMPERSAND'))

    const withEntities = codes(
      '<resources><string name="a">Tom &amp; Jerry &#x1F525; &appname;</string></resources>',
    )
    assert.ok(!withEntities.includes('RAW_AMPERSAND'))
  })

  it('chặn thẻ quên đóng', () => {
    assert.ok(
      codes('<resources><string name="a">A<string name="b">B</string></resources>').includes(
        'UNBALANCED_TAG',
      ),
    )
  })

  it('chặn tệp không còn gì để dịch', () => {
    const found = codes('<resources><string name="a" translatable="false">A</string></resources>')
    assert.ok(found.includes('NOTHING_TO_TRANSLATE'))
  })

  it('KHÔNG nhầm thẻ trong chú thích là mục thật', () => {
    // Chú thích được xoá trắng trước khi soi, nếu không thì một mục bị comment
    // sẽ bị tính là thẻ mở thiếu thẻ đóng.
    const report = validateStringsXml(`<resources>
    <!-- <string name="old">Old</string> -->
    <string name="a">A</string>
</resources>`)
    assert.equal(report.acceptable, true)
    assert.equal(report.translatableCount, 1)
  })

  it('cảnh báo khi có nhiều tham số %s không đánh số', () => {
    const found = codes(
      '<resources><string name="a">%s sent %s a message</string></resources>',
    )
    assert.ok(found.includes('AMBIGUOUS_PLACEHOLDER'))
  })

  it('không cảnh báo khi tham số đã đánh số', () => {
    const found = codes(
      '<resources><string name="a">%1$s sent %2$s a message</string></resources>',
    )
    assert.ok(!found.includes('AMBIGUOUS_PLACEHOLDER'))
  })

  it('cảnh báo là cảnh báo — không chặn dịch', () => {
    const report = validateStringsXml(
      '<resources><string name="a">%s and %s</string></resources>',
    )
    assert.equal(report.acceptable, true)
  })

  it('báo trước số mẻ khi tệp phải cắt nhỏ', () => {
    const many = Array.from({ length: 60 }, (_, index) => `<string name="s${index}">${'x'.repeat(300)}</string>`).join('\n')
    const report = validateStringsXml(`<resources>\n${many}\n</resources>`)

    assert.ok(report.chunkCount > 1)
    assert.ok(report.findings.some((finding) => finding.code === 'MULTIPLE_CHUNKS'))
  })
})
