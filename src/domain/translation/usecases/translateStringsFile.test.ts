import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AppErrors, type Result, ok, err } from '../../../core/result'
import { SUPPORTED_LANGUAGES, findLanguage } from '../entities/LanguageCode'
import type { LanguageOption } from '../entities/LanguageCode'
import type { StringTranslator, TranslateChunkRequest } from '../repositories/StringTranslator'
import { translateStringsFile } from './translateStringsFile'

const SOURCE = `<resources>
    <string name="app_name" translatable="false">BloodSugar</string>
    <string name="hello">Hello 🔥</string>
</resources>`

const language = (code: string): LanguageOption => {
  const found = findLanguage(code)
  assert.ok(found !== undefined, `thiếu ngôn ngữ ${code} trong danh sách`)
  return found
}

/** Adapter giả: trả về đúng mẻ nhận được, có thể ép hỏng theo ngôn ngữ. */
class FakeTranslator implements StringTranslator {
  readonly label = 'fake'
  readonly calls: TranslateChunkRequest[] = []

  constructor(
    private readonly behaviour: (request: TranslateChunkRequest, attempt: number) => Result<string>,
  ) {}

  private readonly attempts = new Map<string, number>()

  translateChunk(request: TranslateChunkRequest): Promise<Result<string>> {
    this.calls.push(request)
    const key = `${request.language.code}|${request.xml.length}`
    const attempt = (this.attempts.get(key) ?? 0) + 1
    this.attempts.set(key, attempt)
    return Promise.resolve(this.behaviour(request, attempt))
  }
}

describe('translateStringsFile', () => {
  it('ra một tệp cho mỗi ngôn ngữ, đúng đường dẫn values-xx', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'BloodSugar',
      languages: [language('vi'), language('in'), language('fil')],
    })

    assert.ok(result.ok)
    assert.deepEqual(
      result.value.files.map((file) => file.path),
      ['values-vi/strings.xml', 'values-in/strings.xml', 'values-fil/strings.xml'],
    )
    assert.equal(result.value.failed.length, 0)
  })

  it('loại mục translatable="false" trước khi gửi cho mô hình', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [language('vi')],
    })

    assert.equal(translator.calls.length, 1)
    assert.ok(!translator.calls[0]?.xml.includes('BloodSugar'), 'app_name không được gửi đi')
  })

  it('che emoji trước khi gửi và ghép lại vào tệp ra', async () => {
    const translator = new FakeTranslator((request) => {
      assert.ok(!request.xml.includes('🔥'), 'emoji phải được che trước khi gửi')
      return ok(request.xml)
    })

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.ok(result.value.files[0]?.xml.includes('🔥'), 'emoji phải quay lại tệp ra')
  })

  it('thử lại một lần khi lượt gọi đầu hỏng', async () => {
    const translator = new FakeTranslator((request, attempt) =>
      attempt === 1 ? err(AppErrors.upstream('429')) : ok(request.xml),
    )

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.failed.length, 0, 'lần thử thứ hai thành công thì không tính là hỏng')
    assert.equal(translator.calls.length, 2)
  })

  it('một ngôn ngữ hỏng KHÔNG kéo theo những ngôn ngữ còn lại', async () => {
    const translator = new FakeTranslator((request) =>
      request.language.code === 'ja' ? err(AppErrors.upstream('mô hình từ chối')) : ok(request.xml),
    )

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [language('vi'), language('ja'), language('ko')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files.length, 3, 'vẫn đủ ba tệp')
    assert.deepEqual(result.value.failed.map((failure) => failure.code), ['ja'])
    assert.ok(result.value.files.find((file) => file.code === 'vi')?.xml.includes('hello'))
  })

  it('ngôn ngữ hỏng hẳn ra tệp rỗng hợp lệ, không phải tệp thiếu', async () => {
    const translator = new FakeTranslator(() => err(AppErrors.upstream('hỏng')))

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files[0]?.xml, '<resources>\n</resources>\n')
  })

  it('báo tiến độ theo từng ngôn ngữ', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))
    const seen: { code: string; ok: boolean }[] = []

    await translateStringsFile(
      { translator },
      { xml: SOURCE, appName: 'x', languages: [language('vi'), language('ja')] },
      (code, failure) => seen.push({ code, ok: failure === null }),
    )

    assert.equal(seen.length, 2)
    assert.ok(seen.every((item) => item.ok))
  })

  it('tệp không còn gì để dịch vẫn ra đủ tệp rỗng, không gọi mô hình lần nào', async () => {
    const translator = new FakeTranslator(() => ok(''))

    const result = await translateStringsFile({ translator }, {
      xml: '<resources><string name="a" translatable="false">A</string></resources>',
      appName: 'x',
      languages: [language('vi'), language('ja')],
    })

    assert.ok(result.ok)
    assert.equal(translator.calls.length, 0)
    assert.equal(result.value.files.length, 2)
    assert.equal(result.value.chunkCount, 0)
  })

  it('dừng ngay khi bị huỷ', async () => {
    const controller = new AbortController()
    const translator = new FakeTranslator(() => {
      controller.abort()
      return err(AppErrors.cancelled('huỷ'))
    })

    const result = await translateStringsFile(
      { translator },
      { xml: SOURCE, appName: 'x', languages: [language('vi')] },
      undefined,
      controller.signal,
    )

    assert.ok(result.ok)
    // Huỷ không được thử lại: một lượt gọi, không phải hai.
    assert.equal(translator.calls.length, 1)
  })

  it('mọi mã ngôn ngữ trong danh sách đều dựng được đường dẫn hợp lệ', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    const result = await translateStringsFile({ translator }, {
      xml: SOURCE,
      appName: 'x',
      languages: [...SUPPORTED_LANGUAGES],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files.length, SUPPORTED_LANGUAGES.length)
    for (const file of result.value.files) {
      assert.match(file.path, /^values-[a-z]{2,3}\/strings\.xml$/)
    }
  })
})
