import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assembleTranslatedXml, chunkResources, extractResourceBlocks } from './StringsChunk'

const entry = (name: string, value = 'x'.repeat(200)): string =>
  `<string name="${name}">${value}</string>`

describe('extractResourceBlocks', () => {
  it('lấy cả string, string-array và plurals', () => {
    const blocks = extractResourceBlocks(
      `<resources>
  <string name="a">A</string>
  <string-array name="b"><item>B</item></string-array>
  <plurals name="c"><item quantity="one">C</item></plurals>
</resources>`,
    )
    assert.equal(blocks.length, 3)
  })

  it('KHÔNG bỏ sót mục viết dạng thẻ tự đóng', () => {
    // Bản Python bỏ sót dạng này, và mục đó biến mất khỏi tệp dịch mà không báo.
    const blocks = extractResourceBlocks('<resources><string name="a"/></resources>')
    assert.deepEqual(blocks, ['<string name="a"/>'])
  })
})

describe('chunkResources', () => {
  it('gom nhiều mục nhỏ vào một mẻ', () => {
    const xml = `<resources>${entry('a', 'A')}${entry('b', 'B')}</resources>`
    assert.equal(chunkResources(xml, 4000).length, 1)
  })

  it('cắt sang mẻ mới khi chạm trần token', () => {
    // Mỗi mục ~230 ký tự ≈ 64 token; trần 100 token nên mỗi mẻ chỉ chứa một mục.
    const xml = `<resources>${entry('a')}${entry('b')}${entry('c')}</resources>`
    assert.equal(chunkResources(xml, 100).length, 3)
  })

  it('không bao giờ cắt GIỮA một mục, kể cả khi mục lớn hơn cả trần', () => {
    const huge = entry('huge', 'y'.repeat(5000))
    const chunks = chunkResources(`<resources>${huge}</resources>`, 10)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0], huge)
  })

  it('trả về mảng rỗng khi không có mục nào', () => {
    assert.deepEqual(chunkResources('<resources></resources>'), [])
  })

  it('không làm mất mục nào sau khi cắt', () => {
    const xml = `<resources>${entry('a')}${entry('b')}${entry('c')}${entry('d')}</resources>`
    const rejoined = chunkResources(xml, 100).join('\n')
    for (const name of ['a', 'b', 'c', 'd']) {
      assert.ok(rejoined.includes(`name="${name}"`), `mất mục ${name}`)
    }
  })
})

describe('assembleTranslatedXml', () => {
  const original = '<resources xmlns:tools="http://schemas.android.com/tools">\n</resources>'

  it('lấy thẻ mở từ tệp GỐC, không lấy từ bản dịch', () => {
    // Mô hình hay đánh rơi xmlns; thuộc tính đó không phải nội dung để dịch.
    const result = assembleTranslatedXml(original, ['<string name="a">A</string>'], {
      escapeApostrophes: true,
    })
    assert.ok(result.startsWith('<resources xmlns:tools="http://schemas.android.com/tools">'))
    assert.ok(result.trimEnd().endsWith('</resources>'))
  })

  it('thoát nháy đơn khi được yêu cầu', () => {
    const result = assembleTranslatedXml(original, ["<string name=\"a\">Don't</string>"], {
      escapeApostrophes: true,
    })
    assert.ok(result.includes("Don\\'t"))
  })

  it('để nguyên nháy đơn khi tắt', () => {
    const result = assembleTranslatedXml(original, ["<string name=\"a\">Don't</string>"], {
      escapeApostrophes: false,
    })
    assert.ok(result.includes("Don't"))
    assert.ok(!result.includes("Don\\'t"))
  })

  it('bỏ qua mẻ rỗng thay vì để lại vùng trống', () => {
    const result = assembleTranslatedXml(original, ['<string name="a">A</string>', '   ', ''], {
      escapeApostrophes: false,
    })
    assert.equal(result, '<resources xmlns:tools="http://schemas.android.com/tools">\n<string name="a">A</string>\n</resources>\n')
  })
})
