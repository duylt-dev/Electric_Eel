import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { AppErrors, type Result, ok, err } from '../../../core/result'
import { SUPPORTED_LANGUAGES, findLanguage } from '../entities/LanguageCode'
import type { LanguageOption } from '../entities/LanguageCode'
import type {
  StringTranslator,
  TranslateChunkError,
  TranslateChunkRequest,
} from '../repositories/StringTranslator'
import type { RetryWait } from './translateChunkWithRetry'
import { MAX_TRANSIENT_ATTEMPTS } from './translateChunkWithRetry'
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
    private readonly behaviour: (
      request: TranslateChunkRequest,
      attempt: number,
    ) => Result<string, TranslateChunkError>,
  ) {}

  private readonly attempts = new Map<string, number>()

  translateChunk(request: TranslateChunkRequest): Promise<Result<string, TranslateChunkError>> {
    this.calls.push(request)
    const key = `${request.language.code}|${request.xml.length}`
    const attempt = (this.attempts.get(key) ?? 0) + 1
    this.attempts.set(key, attempt)
    return Promise.resolve(this.behaviour(request, attempt))
  }
}

/** Không ngủ thật: test chính sách thử lại phải chạy trong mili giây. */
const sleeps: number[] = []
const sleep = (ms: number): Promise<boolean> => {
  sleeps.push(ms)
  return Promise.resolve(true)
}

const rateLimited = (retryAfterMs?: number): TranslateChunkError => ({
  ...AppErrors.upstream('Google Gemini đang giới hạn tần suất.'),
  transient: true,
  ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
})

describe('translateStringsFile', () => {
  beforeEach(() => {
    sleeps.length = 0
  })

  it('ra một tệp cho mỗi ngôn ngữ, đúng đường dẫn values-xx', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'BloodSugar',
      appDescription: '',
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

    await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
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

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.ok(result.value.files[0]?.xml.includes('🔥'), 'emoji phải quay lại tệp ra')
  })

  it('thử lại một lần khi lượt gọi đầu hỏng', async () => {
    const translator = new FakeTranslator((request, attempt) =>
      attempt === 1 ? err(AppErrors.upstream('429')) : ok(request.xml),
    )

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.failed.length, 0, 'lần thử thứ hai thành công thì không tính là hỏng')
    assert.equal(translator.calls.length, 2)
  })

  it('lỗi tạm thời được chờ rồi gọi lại nhiều lần, đúng số giây nhà cung cấp yêu cầu', async () => {
    const waits: RetryWait[] = []
    const translator = new FakeTranslator((request, attempt) =>
      attempt < 4 ? err(rateLimited(12_000)) : ok(request.xml),
    )

    const result = await translateStringsFile(
      { translator, sleep },
      { xml: SOURCE, appName: 'x', appDescription: '', languages: [language('vi')] },
      { onRetryWait: (wait) => waits.push(wait) },
    )

    assert.ok(result.ok)
    assert.equal(result.value.failed.length, 0)
    assert.equal(translator.calls.length, 4)
    assert.deepEqual(sleeps, [12_000, 12_000, 12_000], 'chờ đúng retryAfter, không tự bịa')
    assert.deepEqual(
      waits.map((wait) => [wait.code, wait.attempt, wait.attempts]),
      [['vi', 1, MAX_TRANSIENT_ATTEMPTS], ['vi', 2, MAX_TRANSIENT_ATTEMPTS], ['vi', 3, MAX_TRANSIENT_ATTEMPTS]],
    )
  })

  it('lỗi tạm thời không nói chờ bao lâu thì chờ tăng dần', async () => {
    const translator = new FakeTranslator(() => err(rateLimited()))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(translator.calls.length, MAX_TRANSIENT_ATTEMPTS)
    assert.equal(sleeps.length, MAX_TRANSIENT_ATTEMPTS - 1, 'sau lần cuối thì không chờ nữa')
    for (let i = 1; i < sleeps.length; i += 1) {
      // Có ngẫu nhiên 0.5–1.5, nên chỉ chắc được là lần sau không nhỏ hơn 1/3 lần trước.
      assert.ok((sleeps[i] ?? 0) > (sleeps[i - 1] ?? 0) / 3)
    }
    assert.equal(result.value.failed[0]?.message, 'Không dịch được: Google Gemini đang giới hạn tần suất.')
  })

  it('lỗi không tạm thời (khoá sai, model không có) chỉ thử lại một lần, không chờ', async () => {
    const translator = new FakeTranslator(() => err(AppErrors.notFound('không có model')))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(translator.calls.length, 2)
    assert.deepEqual(sleeps, [])
  })

  it('giữ nhịp theo requestsPerMinute: mọi lượt sau lượt đầu đều phải chờ', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi'), language('ja'), language('ko')],
      requestsPerMinute: 6,
    })

    assert.equal(translator.calls.length, 3)
    assert.equal(sleeps.length, 2, 'ba lượt gọi, lượt đầu đi ngay, hai lượt sau xếp hàng')
    assert.ok(sleeps.every((ms) => ms > 0 && ms <= 20_000))
  })

  it('một ngôn ngữ hỏng KHÔNG kéo theo những ngôn ngữ còn lại', async () => {
    const translator = new FakeTranslator((request) =>
      request.language.code === 'ja' ? err(AppErrors.upstream('mô hình từ chối')) : ok(request.xml),
    )

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi'), language('ja'), language('ko')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files.length, 3, 'vẫn đủ ba tệp')
    assert.deepEqual(result.value.failed.map((failure) => failure.code), ['ja'])
    assert.ok(result.value.files.find((file) => file.code === 'vi')?.xml.includes('hello'))
  })

  it('ngôn ngữ hỏng hẳn ra tệp rỗng hợp lệ, không phải tệp thiếu', async () => {
    const translator = new FakeTranslator(() => err(AppErrors.upstream('hỏng')))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [language('vi')],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files[0]?.xml, '<resources>\n</resources>\n')
  })

  it('báo tiến độ theo từng ngôn ngữ', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))
    const seen: { code: string; ok: boolean }[] = []

    await translateStringsFile(
      { translator, sleep },
      { xml: SOURCE, appName: 'x', appDescription: '', languages: [language('vi'), language('ja')] },
      { onLanguageDone: (code, failure) => seen.push({ code, ok: failure === null }) },
    )

    assert.equal(seen.length, 2)
    assert.ok(seen.every((item) => item.ok))
  })

  it('tệp không còn gì để dịch vẫn ra đủ tệp rỗng, không gọi mô hình lần nào', async () => {
    const translator = new FakeTranslator(() => ok(''))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: '<resources><string name="a" translatable="false">A</string></resources>',
      appName: 'x',
      appDescription: '',
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
      { translator, sleep },
      { xml: SOURCE, appName: 'x', appDescription: '', languages: [language('vi')] },
      {},
      controller.signal,
    )

    assert.ok(result.ok)
    // Huỷ không được thử lại: một lượt gọi, không phải hai.
    assert.equal(translator.calls.length, 1)
  })

  it('mọi mã ngôn ngữ trong danh sách đều dựng được đường dẫn hợp lệ', async () => {
    const translator = new FakeTranslator((request) => ok(request.xml))

    const result = await translateStringsFile({ translator, sleep }, {
      xml: SOURCE,
      appName: 'x',
      appDescription: '',
      languages: [...SUPPORTED_LANGUAGES],
    })

    assert.ok(result.ok)
    assert.equal(result.value.files.length, SUPPORTED_LANGUAGES.length)
    for (const file of result.value.files) {
      assert.match(file.path, /^values-[a-z]{2,3}\/strings\.xml$/)
    }
  })
})
