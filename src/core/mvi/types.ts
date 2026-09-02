import type { StoreApi } from 'zustand/vanilla'

import type { AppError } from '../result/AppError'

/**
 * Bối cảnh truyền vào mỗi lần xử lý intent.
 *
 * Đây là toàn bộ những gì `handleIntent` được phép làm: đọc state, thay state,
 * phát effect, và biết mình đã bị huỷ hay chưa. Không có `router`, không có
 * `setTimeout` tự do, không có đường vòng ra ngoài.
 */
export interface IntentContext<S, E> {
  /**
   * Bị huỷ khi ViewModel bị dispose, hoặc khi một intent mới cùng khoá tới.
   * Truyền vào `fetch(url, { signal })` để công việc dở dang dừng theo.
   */
  readonly signal: AbortSignal
  getState(): S
  /** Cập nhật bất biến. Không sửa tại chỗ. */
  setState(reducer: (current: S) => S): void
  emit(effect: E): void
}

/**
 * Định nghĩa một ViewModel. Tương đương một lớp kế thừa `MviViewModel<S, I, E>`.
 *
 * @typeParam S State — thứ màn hình vẽ ra.
 * @typeParam I Intent — mọi thứ người dùng (hoặc hệ thống) yêu cầu ViewModel làm.
 * @typeParam E Effect — việc xảy ra một lần, không thuộc về state.
 * @typeParam D Dependencies — các cổng ở tầng domain mà ViewModel này cần.
 */
export interface ViewModelDefinition<S, I, E, D> {
  /** Dùng cho thông báo lỗi và React DevTools. */
  readonly name: string

  initialState(deps: D): S

  /**
   * Điểm vào duy nhất. Mọi nhánh xử lý nằm trong đây.
   *
   * Ngoại lệ ném ra từ đây được bắt và quy về `AppError`; huỷ (AbortError)
   * được bỏ qua chứ không coi là lỗi.
   */
  handleIntent(intent: I, ctx: IntentContext<S, E>, deps: D): void | Promise<void>

  /**
   * Khoá gộp công việc. Hai intent cùng khoá thì cái mới huỷ cái cũ.
   *
   * Đây là cách khai báo thay cho việc giữ biến `job` rồi tự gọi `cancel()`:
   * job con luôn là con của job gốc, nên dispose ViewModel là dừng sạch.
   * Trả về `undefined` nếu intent này chạy độc lập.
   */
  intentKey?(intent: I): string | undefined

  /**
   * Xử lý lỗi tập trung. Thường là `ctx.setState` để hiện lỗi, hoặc
   * `ctx.emit` để bật snackbar. Bỏ trống thì lỗi chỉ được ghi ra console.
   */
  onError?(error: AppError, intent: I, ctx: IntentContext<S, E>, deps: D): void

  /** Chạy một lần ngay sau khi ViewModel được tạo. Nơi nạp dữ liệu ban đầu. */
  onStart?(ctx: IntentContext<S, E>, deps: D): void
}

/** Một ViewModel đã được tạo, gắn với vòng đời của một màn hình. */
export interface ViewModelInstance<S, I, E> {
  /**
   * Luồng state — tương đương `StateFlow` bên Android. Màn hình đọc qua hook
   * `useState`, không tự gọi `subscribe`.
   */
  readonly store: StoreApi<S>
  /** Phương thức công khai DUY NHẤT để tác động vào ViewModel. */
  onIntent(intent: I): void
  /** Gắn người tiêu thụ Effect. Chỉ một. */
  connectEffects(consumer: (effect: E) => void): () => void
  dispose(): void
  readonly isDisposed: boolean
  readonly name: string
}
