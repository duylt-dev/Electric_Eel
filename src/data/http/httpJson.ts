import { AppErrors, type Result, err, ok } from '../../core/result'
import type { AppError, AppErrorKind } from '../../core/result'

interface ErrorEnvelope {
  error?: { kind?: string; message?: string; detail?: string }
}

const KNOWN_KINDS: ReadonlySet<string> = new Set<AppErrorKind>([
  'unauthorized',
  'forbidden',
  'notFound',
  'validation',
  'conflict',
  'upstream',
  'network',
  'cancelled',
  'unknown',
])

const FALLBACK_MESSAGE: Record<number, string> = {
  401: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu yêu cầu.',
  409: 'Dữ liệu trên Firebase đã thay đổi. Tải lại rồi đối chiếu trước khi lưu.',
}

/**
 * Dịch phản hồi lỗi của API trở lại thành `AppError` với đúng `kind` ban đầu.
 *
 * Giữ được `kind` là điều quan trọng: màn hình cần phân biệt `conflict` (hiện
 * nút "tải lại và đối chiếu") với `validation` (tô sáng ô nhập sai). Nếu chỉ
 * còn lại một chuỗi thông báo thì mọi lỗi trông giống nhau.
 */
const toAppErrorFromResponse = async (response: Response): Promise<AppError> => {
  let body: ErrorEnvelope | null = null
  try {
    body = (await response.json()) as ErrorEnvelope
  } catch {
    body = null
  }

  const kind = body?.error?.kind
  const message =
    body?.error?.message ?? FALLBACK_MESSAGE[response.status] ?? `Yêu cầu thất bại (HTTP ${response.status}).`
  const detail = body?.error?.detail

  if (kind !== undefined && KNOWN_KINDS.has(kind)) {
    return { kind: kind as AppErrorKind, message, ...(detail !== undefined ? { detail } : {}) }
  }
  return AppErrors.unknown(message, detail !== undefined ? { detail } : undefined)
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** Gọi API nội bộ. Không bao giờ ném — luôn trả về `Result`. */
export async function httpJson<T>(path: string, options: HttpRequestOptions = {}): Promise<Result<T>> {
  const { method = 'GET', body, headers = {}, signal } = options

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal !== undefined ? { signal } : {}),
      cache: 'no-store',
    })
  } catch (thrown) {
    if (signal?.aborted === true) return err(AppErrors.cancelled('Thao tác đã bị huỷ.'))
    return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
  }

  if (!response.ok) return err(await toAppErrorFromResponse(response))

  if (response.status === 204) return ok(undefined as T)

  try {
    return ok((await response.json()) as T)
  } catch (thrown) {
    return err(AppErrors.unknown('Máy chủ trả về nội dung không đọc được.', { cause: thrown }))
  }
}
