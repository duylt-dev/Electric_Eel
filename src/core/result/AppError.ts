/**
 * Một lỗi có thể hiển thị cho người dùng.
 *
 * Mọi tầng đều trả về `AppError` thay vì ném exception xuyên tầng. Lý do:
 * tầng gọi không thể biết tầng dưới ném ra cái gì, nên `try/catch` ở xa nơi
 * phát sinh lỗi luôn bắt nhầm hoặc bắt sót. Kiểu trả về nói rõ hàm này hỏng
 * được theo những cách nào.
 */
export type AppErrorKind =
  /** Chưa đăng nhập, hoặc phiên đã hết hạn. */
  | 'unauthorized'
  /** Đã đăng nhập nhưng không đủ quyền trên app này. */
  | 'forbidden'
  /** Không tìm thấy tài nguyên. */
  | 'notFound'
  /** Dữ liệu người dùng nhập không hợp lệ. */
  | 'validation'
  /** ETag lệch — người khác đã publish trước. Đây là lỗi cần xử lý riêng. */
  | 'conflict'
  /** Firebase (hoặc dịch vụ ngoài) trả lỗi. */
  | 'upstream'
  /** Không gọi được tới nơi cần gọi. */
  | 'network'
  /** Thao tác bị huỷ có chủ đích. Không phải lỗi — không hiển thị, không log. */
  | 'cancelled'
  | 'unknown'

export interface AppError {
  readonly kind: AppErrorKind
  /** Câu hiển thị được cho người dùng. Tiếng Việt, nói rõ phải làm gì tiếp. */
  readonly message: string
  /** Chi tiết kỹ thuật cho log. Không hiển thị lên UI. */
  readonly detail?: string
  readonly cause?: unknown
}

const make =
  (kind: AppErrorKind) =>
  (message: string, options?: { detail?: string; cause?: unknown }): AppError => ({
    kind,
    message,
    ...(options?.detail !== undefined ? { detail: options.detail } : {}),
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  })

export const AppErrors = {
  unauthorized: make('unauthorized'),
  forbidden: make('forbidden'),
  notFound: make('notFound'),
  validation: make('validation'),
  conflict: make('conflict'),
  upstream: make('upstream'),
  network: make('network'),
  cancelled: make('cancelled'),
  unknown: make('unknown'),
} as const

export const isAppError = (value: unknown): value is AppError =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  'message' in value &&
  typeof (value as AppError).message === 'string'

/** Huỷ do AbortController biểu hiện thành nhiều dạng khác nhau tuỳ runtime. */
export const isAbortError = (value: unknown): boolean =>
  (value instanceof DOMException && value.name === 'AbortError') ||
  (value instanceof Error && value.name === 'AbortError') ||
  (isAppError(value) && value.kind === 'cancelled')

/** Quy mọi thứ ném ra được về một `AppError`. Dùng ở biên bắt lỗi. */
export function toAppError(value: unknown, fallbackMessage = 'Đã xảy ra lỗi không xác định.'): AppError {
  if (isAppError(value)) return value
  if (isAbortError(value)) return AppErrors.cancelled('Thao tác đã bị huỷ.')
  if (value instanceof Error) {
    return AppErrors.unknown(fallbackMessage, { detail: `${value.name}: ${value.message}`, cause: value })
  }
  return AppErrors.unknown(fallbackMessage, { detail: String(value), cause: value })
}
