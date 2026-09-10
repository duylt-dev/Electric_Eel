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
 *   · Mỗi mẻ được thử lại một lần. Lỗi 429 và 5xx của nhà cung cấp là chuyện
 *     thường; ở 28 ngôn ngữ thì "thường" nghĩa là gần như chắc chắn xảy ra.
 *   · Mẻ hỏng hẳn thì bị BỎ chứ không chèn nội dung gốc vào. Chuỗi thiếu trong
 *     `values-fr` được Android tự lấy từ `values`, còn chuỗi tiếng Anh nằm sẵn
 *     trong đó thì mãi mãi không ai biết là nó chưa được dịch.
 */
import { mapWithLimit } from '../../../core/util/concurrency'
import { type Result, ok } from '../../../core/result'
import { protectSpecials, restorePlaceholders } from '../entities/GlyphMask'
import type { LanguageOption } from '../entities/LanguageCode'
import { valuesDirectory } from '../entities/LanguageCode'
import { DEFAULT_CHUNK_TOKEN_LIMIT, assembleTranslatedXml, chunkResources } from '../entities/StringsChunk'
import type { LanguageFailure } from '../entities/TranslationJob'
import { emptyResourcesSkeleton, hasTranslatableEntry, prepareForTranslation, stripCodeFences } from '../entities/XmlText'
import type { StringTranslator } from '../repositories/StringTranslator'

export interface TranslateStringsDeps {
  readonly translator: StringTranslator
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

/** Số lần gọi mô hình cho MỖI mẻ, tính cả lần đầu. */
const ATTEMPTS_PER_CHUNK = 2

/**
 * Một mẻ đã dịch xong, hoặc lý do nó hỏng.
 *
 * `null` chứ không phải chuỗi rỗng: chuỗi rỗng là một mẻ dịch ra không có gì,
 * còn `null` là một mẻ chưa bao giờ về tới nơi. Hai thứ đó dẫn tới hai thông
 * báo khác nhau cho người dùng.
 */
type ChunkResult = { readonly xml: string } | { readonly xml: null; readonly reason: string }

async function translateChunk(
  deps: TranslateStringsDeps,
  chunk: string,
  language: LanguageOption,
  input: TranslateStringsInput,
  signal: AbortSignal | undefined,
): Promise<ChunkResult> {
  const { masked, masking } = protectSpecials(chunk, input.preferNumericEntities ?? false)
  let lastReason = 'Không rõ nguyên nhân.'

  for (let attempt = 1; attempt <= ATTEMPTS_PER_CHUNK; attempt += 1) {
    if (signal?.aborted === true) return { xml: null, reason: 'Đã huỷ.' }

    const translated = await deps.translator.translateChunk(
      { xml: masked, language, appName: input.appName, appDescription: input.appDescription },
      signal,
    )

    if (translated.ok) {
      const cleaned = stripCodeFences(translated.value)
      if (cleaned.trim().length > 0) {
        return { xml: restorePlaceholders(cleaned, masking) }
      }
      lastReason = 'Mô hình trả về nội dung rỗng.'
    } else {
      // Huỷ không phải lỗi để thử lại — người dùng đã bỏ đi.
      if (translated.error.kind === 'cancelled') return { xml: null, reason: 'Đã huỷ.' }
      lastReason = translated.error.message
    }
  }

  return { xml: null, reason: lastReason }
}

async function translateOneLanguage(
  deps: TranslateStringsDeps,
  chunks: readonly string[],
  language: LanguageOption,
  input: TranslateStringsInput,
  signal: AbortSignal | undefined,
): Promise<{ file: TranslatedFile; failure: LanguageFailure | null }> {
  const results = await mapWithLimit(
    chunks,
    input.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY,
    (chunk) => translateChunk(deps, chunk, language, input, signal),
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
  onLanguageDone?: (code: string, failure: LanguageFailure | null) => void,
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

  const outcomes = await mapWithLimit(
    input.languages,
    input.languageConcurrency ?? DEFAULT_LANGUAGE_CONCURRENCY,
    async (language) => {
      const outcome = await translateOneLanguage(deps, chunks, language, input, signal)
      onLanguageDone?.(language.code, outcome.failure)
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
