import { type AppError, toAppError } from './AppError'

/**
 * Kết quả của một thao tác hỏng được.
 *
 * Đây là thứ thay cho việc ném exception qua ranh giới tầng. Chữ ký hàm nói
 * thẳng "cái này hỏng được", nên người gọi không thể quên xử lý — trình biên
 * dịch bắt buộc phải thu hẹp kiểu trước khi chạm vào `value`.
 */
export type Result<T, E = AppError> = Ok<T> | Err<E>

export interface Ok<T> {
  readonly ok: true
  readonly value: T
}

export interface Err<E> {
  readonly ok: false
  readonly error: E
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok

export function mapResult<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result
}

export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? transform(result.value) : result
}

export function mapError<T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(transform(result.error))
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

/** Gom một mảng kết quả: hỏng cái đầu tiên thì dừng. */
export function allResults<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}

/** Bọc code có thể ném — dùng ở đúng biên tiếp xúc với thư viện ngoài. */
export function attempt<T>(fn: () => T, fallbackMessage?: string): Result<T, AppError> {
  try {
    return ok(fn())
  } catch (thrown) {
    return err(toAppError(thrown, fallbackMessage))
  }
}

export async function attemptAsync<T>(
  fn: () => Promise<T>,
  fallbackMessage?: string,
): Promise<Result<T, AppError>> {
  try {
    return ok(await fn())
  } catch (thrown) {
    return err(toAppError(thrown, fallbackMessage))
  }
}
