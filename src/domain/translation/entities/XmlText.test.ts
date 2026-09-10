import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  emptyResourcesSkeleton,
  escapeApostrophesOutsideTags,
  hasTranslatableEntry,
  prepareForTranslation,
  removeNonTranslatables,
  resourcesOpenTag,
  stripComments,
  stripCodeFences,
} from './XmlText'

describe('removeNonTranslatables', () => {
  it('loại mục translatable="false" dạng có thẻ đóng', () => {
    const result = removeNonTranslatables(
      `<resources>
    <string name="app_name" translatable="false">BloodSugar</string>
    <string name="hello">Hello</string>
</resources>`,
    )

    assert.equal(result.removed, 1)
    assert.ok(!result.xml.includes('BloodSugar'))
    assert.ok(result.xml.includes('hello'))
  })

  it('loại cả dạng thẻ tự đóng', () => {
    const result = removeNonTranslatables(
      `<resources>
    <string name="empty" translatable="false"/>
    <string name="hello">Hello</string>
</resources>`,
    )
    assert.equal(result.removed, 1)
  })

  it('không loại nhầm mục translatable="true"', () => {
    const result = removeNonTranslatables('<resources>\n    <string name="a" translatable="true">A</string>\n</resources>')
    assert.equal(result.removed, 0)
  })
})

describe('escapeApostrophesOutsideTags', () => {
  it('thoát nháy đơn trong phần văn bản', () => {
    assert.equal(
      escapeApostrophesOutsideTags("<string name=\"a\">Don't stop</string>"),
      "<string name=\"a\">Don\\'t stop</string>",
    )
  })

  it('KHÔNG đụng tới thuộc tính viết bằng nháy đơn', () => {
    // Thay thế trên cả tệp sẽ phá thẻ này — đây là lý do hàm phải cắt theo thẻ.
    const source = "<string name=\"a\"><font color='#A005FF'>x</font></string>"
    assert.equal(escapeApostrophesOutsideTags(source), source)
  })

  it('không thoát hai lần thứ đã thoát rồi', () => {
    const source = "<string name=\"a\">Don\\'t</string>"
    assert.equal(escapeApostrophesOutsideTags(source), source)
  })

  it('bỏ qua nội dung trong chú thích', () => {
    const source = "<!-- don't touch --><string name=\"a\">ok</string>"
    assert.equal(escapeApostrophesOutsideTags(source), source)
  })
})

describe('stripCodeFences', () => {
  it('bóc rào ```xml', () => {
    assert.equal(stripCodeFences('```xml\n<resources/>\n```'), '<resources/>')
  })

  it('cắt luôn câu dẫn nhập mô hình tự thêm vào', () => {
    assert.equal(
      stripCodeFences("Here is the translated file:\n<resources/>"),
      '<resources/>',
    )
  })

  it('để yên nội dung đã sạch', () => {
    assert.equal(stripCodeFences('<resources/>'), '<resources/>')
  })
})

describe('resourcesOpenTag', () => {
  it('giữ nguyên thuộc tính của thẻ gốc', () => {
    const tag = resourcesOpenTag('<resources xmlns:tools="http://schemas.android.com/tools">')
    assert.equal(tag, '<resources xmlns:tools="http://schemas.android.com/tools">')
  })

  it('rơi về thẻ trần khi tệp không có thẻ mở', () => {
    assert.equal(resourcesOpenTag('rác'), '<resources>')
  })
})

describe('emptyResourcesSkeleton', () => {
  it('ra một tệp rỗng nhưng hợp lệ', () => {
    assert.equal(emptyResourcesSkeleton('<resources>\n<string name="a">A</string>\n</resources>'), '<resources>\n</resources>\n')
  })
})

describe('hasTranslatableEntry', () => {
  it('nhận ra cả ba loại mục', () => {
    assert.equal(hasTranslatableEntry('<resources><string name="a">A</string></resources>'), true)
    assert.equal(hasTranslatableEntry('<resources><plurals name="a"/></resources>'), true)
    assert.equal(hasTranslatableEntry('<resources></resources>'), false)
  })
})

describe('removeNonTranslatables — tệp viết liền một dòng', () => {
  it('vẫn loại được mục translatable="false" khi cả tệp nằm trên một dòng', () => {
    // Bản `main.py` neo vào đầu dòng nên bỏ sót trường hợp này, và hậu quả là
    // `app_name` bị đem đi dịch rồi lọt tới tận cửa hàng ứng dụng.
    const result = removeNonTranslatables(
      '<resources><string name="app_name" translatable="false">BloodSugar</string><string name="a">A</string></resources>',
    )

    assert.equal(result.removed, 1)
    assert.ok(!result.xml.includes('BloodSugar'))
    assert.ok(result.xml.includes('name="a"'))
  })

  it('loại cả thẻ tự đóng viết liền', () => {
    const result = removeNonTranslatables(
      '<resources><string name="x" translatable="false"/><string name="a">A</string></resources>',
    )
    assert.equal(result.removed, 1)
  })
})

describe('stripComments / prepareForTranslation', () => {
  it('bỏ chú thích để mục đã tắt không sống lại trong tệp dịch', () => {
    const prepared = prepareForTranslation(`<resources>
    <!-- <string name="old">Old</string> -->
    <string name="a">A</string>
</resources>`)

    assert.ok(!prepared.xml.includes('name="old"'), 'mục trong chú thích phải biến mất')
    assert.ok(prepared.xml.includes('name="a"'))
  })

  it('KHÔNG đụng tới CDATA, kể cả khi bên trong có thứ trông như chú thích', () => {
    const source = '<resources><string name="a"><![CDATA[<!-- giữ nguyên -->]]></string></resources>'
    assert.equal(stripComments(source), source)
  })

  it('không đếm mục nằm trong chú thích vào số mục bị loại', () => {
    const prepared = prepareForTranslation(
      '<resources><!-- <string name="x" translatable="false">X</string> --><string name="a">A</string></resources>',
    )
    assert.equal(prepared.removed, 0)
  })
})
