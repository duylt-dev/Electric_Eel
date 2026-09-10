import { AppErrors } from '../../core/result'
import type { AppError } from '../../core/result'
import { LLM_PROVIDER_INFO } from '../../domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'

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

/** Đọc thân lỗi để đưa vào `detail`. Cắt ngắn: log không cần cả trang HTML. */
export async function describeFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return text.length === 0 ? `HTTP ${response.status}` : text.slice(0, 500)
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
): AppError {
  const label = LLM_PROVIDER_INFO[provider].label

  if (options.userSignal?.aborted === true) return AppErrors.cancelled('Đã huỷ lượt gọi.')

  if (options.timeout?.aborted === true) {
    const seconds = Math.round((options.timeoutMs ?? 0) / 1000)
    return AppErrors.network(`${label} không trả lời trong ${seconds} giây.`)
  }

  return AppErrors.network(`Không gọi được tới ${label}.`, { cause: thrown })
}
