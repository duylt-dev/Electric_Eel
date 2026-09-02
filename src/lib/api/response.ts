import { NextResponse } from 'next/server'

import type { AppError, AppErrorKind } from '@/core/result'

/**
 * Quy đổi giữa lỗi trong miền và mã trạng thái HTTP — chỉ ở đúng file này.
 *
 * Nhờ vậy `AppError` giữ được ý nghĩa nghiệp vụ (`conflict` = có người publish
 * trước) thay vì bị nhét thành con số 409 ngay từ chỗ phát sinh, và adapter
 * HTTP phía trình duyệt dịch ngược lại được đúng loại lỗi ban đầu.
 */
const STATUS_BY_KIND: Record<AppErrorKind, number> = {
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  validation: 400,
  conflict: 409,
  upstream: 502,
  network: 504,
  cancelled: 499,
  unknown: 500,
}

export interface ApiErrorBody {
  error: { kind: AppErrorKind; message: string; detail?: string }
}

export const jsonOk = <T>(data: T, init?: ResponseInit): NextResponse =>
  NextResponse.json(data, { status: 200, ...init })

/**
 * Những loại lỗi được phép mang `detail` xuống trình duyệt.
 *
 * Danh sách cho phép, không phải danh sách cấm, và cũng không phải "mọi mã dưới
 * 500". Luật cũ dựa vào mã trạng thái, mà `forbidden` và `notFound` đều dưới
 * 500 — trong khi `detail` của đúng hai loại đó lại là thân lỗi thô Google trả
 * về, kèm số hiệu project và email service account.
 *
 * Hai loại còn lại thì `detail` nói về dữ liệu người dùng vừa gửi lên, nên đưa
 * ra là đúng: không có nó thì "Firebase từ chối nội dung" là một câu không sửa
 * được gì.
 */
const KINDS_WITH_PUBLIC_DETAIL: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>([
  'validation',
  'conflict',
])

export function jsonError(error: AppError): NextResponse<ApiErrorBody> {
  const status = STATUS_BY_KIND[error.kind] ?? 500
  const exposeDetail = KINDS_WITH_PUBLIC_DETAIL.has(error.kind) && error.detail !== undefined

  // Ghi log mọi lỗi có chi tiết bị giữ lại, không chỉ lỗi 5xx. Nếu không, chi
  // tiết của một lỗi 403 từ Firebase sẽ không xuất hiện ở đâu cả — vừa không
  // gửi đi, vừa không ghi lại.
  if (status >= 500 || (!exposeDetail && error.detail !== undefined)) {
    console.error(`[api] ${error.kind}: ${error.message}`, error.detail ?? error.cause ?? '')
  }

  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        kind: error.kind,
        message: error.message,
        ...(exposeDetail ? { detail: error.detail } : {}),
      },
    },
    { status },
  )
}

/** Đọc thân yêu cầu dạng JSON, không để ngoại lệ thoát ra ngoài handler. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
