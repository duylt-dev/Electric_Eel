/**
 * Điều phối một lượt dịch: từ một tệp `strings.xml` ra N tệp theo N ngôn ngữ.
 *
 * Bản dịch của `chunk.py` sang kiến trúc ở đây, giữ nguyên trình tự:
 *
 *   1. Loại các mục `translatable="false"`.
 *   2. Cắt phần còn lại thành mẻ theo trần token.
 *   3. Mỗi ngôn ngữ, mỗi mẻ: che biểu tượng → gọi mô hình → ghép biểu tượng lại.
 *   4. Ghép các mẻ thành một tệp, thoát dấu nháy đơn ở phần văn bản.
 *
 * Ba chỗ đi xa hơn bản Python, và cả ba đều vì cùng một lý do — bản Python chạy
 * trên máy một người, còn cái này chạy cho cả nhóm và không ai ngồi nhìn log:
 *
 *   · Hỏng một ngôn ngữ không kéo theo 27 ngôn ngữ còn lại. Bản Python dùng
 *     `asyncio.gather` không bắt lỗi, nên một lượt gọi hỏng là mất cả mẻ.
 *   · Lượt gọi được giữ nhịp theo số lượt mỗi phút, và mẻ hỏng vì 429/5xx
 *     được chờ rồi gọi lại (xem `translateChunkWithRetry`). Ở 28 ngôn ngữ trên
 *     một khoá cá nhân, không giữ nhịp nghĩa là chắc chắn chạm hạn mức.
 *   · Mẻ hỏng hẳn thì bị BỎ chứ không chèn nội dung gốc vào. Chuỗi thiếu trong
 *     `values-fr` được Android tự lấy từ `values`, còn chuỗi tiếng Anh nằm sẵn
 *     trong đó thì mãi mãi không ai biết là nó chưa được dịch.
 */
import { delay, mapWithLimit } from '../../../core/util/concurrency'
import { createRatePacer } from '../../../core/util/ratePacer'
import { type Result, ok } from '../../../core/result'
import type { LanguageOption } from '../entities/LanguageCode'
import { valuesDirectory } from '../entities/LanguageCode'
import { DEFAULT_CHUNK_TOKEN_LIMIT, assembleTranslatedXml, chunkResources } from '../entities/StringsChunk'
import type { LanguageFailure } from '../entities/TranslationJob'
import { emptyResourcesSkeleton, hasTranslatableEntry, prepareForTranslation } from '../entities/XmlText'
import type { StringTranslator } from '../repositories/StringTranslator'
import { type ChunkRetryDeps, type RetryWait, translateChunkWithRetry } from './translateChunkWithRetry'

export type { RetryWait } from './translateChunkWithRetry'

export interface TranslateStringsDeps {
  readonly translator: StringTranslator
  /** Hàm chờ, tiêm được để test không ngồi chờ thật khi thử lại. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>
}

/** Tiến độ chảy ra trong lúc chạy. Cả hai đều tuỳ chọn: bên gọi nghe thứ mình cần. */
export interface TranslateStringsObserver {
  readonly onLanguageDone?: (code: string, failure: LanguageFailure | null) => void
  /** Một mẻ đang đứng chờ trước khi gọi lại — để giao diện nói vì sao đứng. */
  readonly onRetryWait?: (wait: RetryWait) => void
}

export interface TranslateStringsInput {
  readonly xml: string
  readonly appName: string
  /** Mô tả app cho prompt. Chuỗi rỗng là hợp lệ — prompt sẽ bỏ phần đó đi. */
  readonly appDescription: string
  readonly languages: readonly LanguageOption[]
  readonly chunkTokenLimit?: number
  /** Số ngôn ngữ chạy song song. */
  readonly languageConcurrency?: number
  /** Số mẻ chạy song song TRONG một ngôn ngữ. */
  readonly chunkConcurrency?: number
  /** Trần số lượt gọi mô hình mỗi phút cho CẢ lượt dịch. Bỏ trống hoặc 0 là không giữ nhịp. */
  readonly requestsPerMinute?: number
  /** Trả biểu tượng về dạng `&#x1F525;` thay vì ký tự thật. */
  readonly preferNumericEntities?: boolean
  readonly escapeApostrophes?: boolean
}

export interface TranslatedFile {
  /** Đường dẫn trong tệp zip: `values-vi/strings.xml`. */
  readonly path: string
  readonly code: string
  readonly xml: string
}

export interface TranslateStringsOutput {
  readonly files: readonly TranslatedFile[]
  readonly failed: readonly LanguageFailure[]
  readonly chunkCount: number
}

const DEFAULT_LANGUAGE_CONCURRENCY = 6
const DEFAULT_CHUNK_CONCURRENCY = 4

async function translateOneLanguage(
  deps: ChunkRetryDeps,
  chunks: readonly string[],
  language: LanguageOption,
  input: TranslateStringsInput,
  signal: AbortSignal | undefined,
): Promise<{ file: TranslatedFile; failure: LanguageFailure | null }> {
  const chunkInput = {
    appName: input.appName,
    appDescription: input.appDescription,
    preferNumericEntities: input.preferNumericEntities ?? false,
  }
  const results = await mapWithLimit(
    chunks,
    input.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY,
    (chunk) => translateChunkWithRetry(deps, chunk, language, chunkInput, signal),
  )

  const translated = results.filter((result): result is { xml: string } => result.xml !== null)
  const lost = results.length - translated.length

  const xml =
    translated.length === 0
      ? emptyResourcesSkeleton(input.xml)
      : assembleTranslatedXml(
          input.xml,
          translated.map((result) => result.xml),
          { escapeApostrophes: input.escapeApostrophes ?? true },
        )

  const firstReason =
    results.find((result): result is { xml: null; reason: string } => result.xml === null)?.reason ??
    'Không rõ nguyên nhân.'

  return {
    file: { path: `${valuesDirectory(language.code)}/strings.xml`, code: language.code, xml },
    failure:
      lost === 0
        ? null
        : {
            code: language.code,
            message:
              lost === results.length
                ? `Không dịch được: ${firstReason}`
                : `Thiếu ${lost}/${results.length} mẻ: ${firstReason}`,
          },
  }
}

export async function translateStringsFile(
  deps: TranslateStringsDeps,
  input: TranslateStringsInput,
  observer: TranslateStringsObserver = {},
  signal?: AbortSignal,
): Promise<Result<TranslateStringsOutput>> {
  const filtered = prepareForTranslation(input.xml)

  // Không còn gì để dịch vẫn ra một bộ tệp hợp lệ, chỉ là rỗng. Thiếu hẳn
  // `values-xx/strings.xml` và có nó nhưng rỗng là hai tình huống khác nhau.
  if (!hasTranslatableEntry(filtered.xml)) {
    const skeleton = emptyResourcesSkeleton(input.xml)
    return ok({
      files: input.languages.map((language) => ({
        path: `${valuesDirectory(language.code)}/strings.xml`,
        code: language.code,
        xml: skeleton,
      })),
      failed: [],
      chunkCount: 0,
    })
  }

  const chunks = chunkResources(filtered.xml, input.chunkTokenLimit ?? DEFAULT_CHUNK_TOKEN_LIMIT)

  // Một bộ giữ nhịp cho CẢ lượt: hạn mức tính theo khoá, và mọi ngôn ngữ ở đây
  // đi chung một khoá. Mỗi ngôn ngữ một bộ riêng thì cộng lại vẫn vượt.
  const sleep = deps.sleep ?? delay
  const chunkDeps: ChunkRetryDeps = {
    translator: deps.translator,
    pacer: createRatePacer(input.requestsPerMinute ?? 0, sleep),
    sleep,
    ...(observer.onRetryWait !== undefined ? { onRetryWait: observer.onRetryWait } : {}),
  }

  const outcomes = await mapWithLimit(
    input.languages,
    input.languageConcurrency ?? DEFAULT_LANGUAGE_CONCURRENCY,
    async (language) => {
      const outcome = await translateOneLanguage(chunkDeps, chunks, language, input, signal)
      observer.onLanguageDone?.(language.code, outcome.failure)
      return outcome
    },
  )

  return ok({
    files: outcomes.map((outcome) => outcome.file),
    failed: outcomes
      .map((outcome) => outcome.failure)
      .filter((failure): failure is LanguageFailure => failure !== null),
    chunkCount: chunks.length,
  })
}
