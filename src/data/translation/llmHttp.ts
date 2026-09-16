import { AppErrors } from '../../core/result'
import type { AppError } from '../../core/result'
import { LLM_PROVIDER_INFO } from '../../domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'
import type { TranslateChunkError } from '../../domain/translation/repositories/StringTranslator'

/**
 * Phần nói chuyện HTTP dùng chung cho mọi lượt gọi tới nhà cung cấp mô hình.
 *
 * Có hai bên gọi — dịch một mẻ, và liệt kê model — và cả hai đều cần đúng một
 * bảng quy lỗi. Để mỗi bên tự viết `switch (status)` của mình thì sớm muộn hai
 * bảng lệch nhau, và người dùng nhận hai câu khác nhau cho cùng một khoá sai.
 *
 * Không dùng SDK của OpenAI hay Google: cái cần ở đây là "gửi một yêu cầu,
 * đọc một phản hồi". Hai SDK đó mang theo streaming, gọi công cụ, đếm token và
 * một cây phụ thuộc riêng — trả giá bằng dung lượng và bằng việc phải nâng cấp
 * theo chúng, đổi lại một thứ `fetch` làm được trong ba mươi dòng.
 */
export const OPENAI_BASE = 'https://api.openai.com/v1'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Tiêu đề mang khoá. Hai nhà cung cấp đặt ở hai chỗ khác nhau. */
export const authHeaders = (
  provider: LlmProviderName,
  apiKey: string,
): Record<string, string> =>
  provider === 'openai'
    ? { Authorization: `Bearer ${apiKey}` }
    : { 'x-goog-api-key': apiKey }

/**
 * Quy lỗi HTTP của nhà cung cấp về loại lỗi trong miền.
 *
 * 401/403 nói riêng phải là một câu người dùng làm được gì đó với nó. Nay khoá
 * là của chính họ chứ không nằm trong `.env` của máy chủ, nên câu cũ ("kiểm tra
 * lại khoá trong .env") không còn chỉ đúng chỗ nào cả.
 */
export function mapProviderFailure(
  status: number,
  provider: LlmProviderName,
  detail: string,
): AppError {
  const label = LLM_PROVIDER_INFO[provider].label

  switch (status) {
    case 400:
      return AppErrors.validation(`${label} từ chối yêu cầu: ${detail}`, { detail })
    case 401:
    case 403:
      return AppErrors.upstream(
        `${label} không nhận khoá này. Kiểm tra lại khoá đã dán và hạn mức của tài khoản.`,
        { detail },
      )
    case 404:
      return AppErrors.notFound(`${label} không có model này. Chọn lại model trong danh sách.`, {
        detail,
      })
    case 429:
      return AppErrors.upstream(`${label} đang giới hạn tần suất. Thử lại sau ít phút.`, { detail })
    default:
      return AppErrors.upstream(`${label} trả lỗi HTTP ${status}.`, { detail })
  }
}

/** Thân lỗi đã đọc, kèm khoảng chờ nhà cung cấp yêu cầu nếu họ có nói. */
export interface ProviderFailure {
  readonly detail: string
  readonly retryAfterMs?: number
}

/**
 * Đọc thân lỗi một lần, lấy ra hai thứ: chi tiết để log, và "chờ bao lâu".
 *
 * Khoảng chờ nằm ở ba chỗ tuỳ nhà cung cấp, và không chỗ nào là chuẩn chung:
 *
 *   · Tiêu đề `Retry-After` — chuẩn HTTP, cả hai bên đôi khi gửi.
 *   · Gemini: `"retryDelay": "37s"` trong `error.details` (google.rpc.RetryInfo).
 *   · OpenAI: câu "Please try again in 20s" (hoặc `350ms`) trong `error.message`.
 *
 * Đọc bằng regex trên văn bản thô thay vì parse JSON: thân lỗi 5xx thường là
 * HTML, và một trang HTML không nên làm hỏng việc đọc mã lỗi.
 */
export async function readFailure(response: Response): Promise<ProviderFailure> {
  const text = await response.text().catch(() => '')
  const detail = text.length === 0 ? `HTTP ${response.status}` : text.slice(0, 500)
  const retryAfterMs = retryAfterFrom(response.headers.get('retry-after'), text)
  return retryAfterMs === undefined ? { detail } : { detail, retryAfterMs }
}

/** Chỉ cần chi tiết, không cần khoảng chờ — dùng khi liệt kê model. */
export const describeFailure = async (response: Response): Promise<string> =>
  (await readFailure(response)).detail

function retryAfterFrom(header: string | null, body: string): number | undefined {
  if (header !== null) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    const at = Date.parse(header)
    if (Number.isFinite(at)) return Math.max(0, at - Date.now())
  }

  const gemini = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)
  if (gemini?.[1] !== undefined) return Number(gemini[1]) * 1000

  const openai = /try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(body)
  if (openai?.[1] !== undefined) {
    return Number(openai[1]) * (openai[2]?.toLowerCase() === 'ms' ? 1 : 1000)
  }
  return undefined
}

/** 429 và 5xx là lỗi của phía họ hoặc của hạn mức — chờ rồi gọi lại là có cơ hội. */
export const isTransientStatus = (status: number): boolean => status === 429 || status >= 500

/** Gắn gợi ý thử lại vào lỗi HTTP đã quy về `AppError`. */
export function toChunkError(
  error: AppError,
  status: number,
  failure: ProviderFailure,
): TranslateChunkError {
  if (!isTransientStatus(status)) return error
  return {
    ...error,
    transient: true,
    ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
  }
}

/**
 * Quy một ngoại lệ của `fetch` về `AppError`, phân biệt được ba nguồn dừng.
 *
 * Gộp cả ba thành "lỗi mạng" là cách để một lượt huỷ có chủ đích hiện lên
 * thành một thông báo đỏ, và một lượt quá hạn hiện lên thành "mất mạng".
 */
export function mapProviderThrow(
  thrown: unknown,
  provider: LlmProviderName,
  options: { readonly userSignal?: AbortSignal; readonly timeout?: AbortSignal; readonly timeoutMs?: number },
): TranslateChunkError {
  const label = LLM_PROVIDER_INFO[provider].label

  if (options.userSignal?.aborted === true) return AppErrors.cancelled('Đã huỷ lượt gọi.')

  // Quá hạn và mất mạng đều là chuyện tạm thời — khác với huỷ ở trên.
  if (options.timeout?.aborted === true) {
    const seconds = Math.round((options.timeoutMs ?? 0) / 1000)
    return { ...AppErrors.network(`${label} không trả lời trong ${seconds} giây.`), transient: true }
  }

  return { ...AppErrors.network(`Không gọi được tới ${label}.`, { cause: thrown }), transient: true }
}
