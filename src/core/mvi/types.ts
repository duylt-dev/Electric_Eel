import type { StoreApi } from 'zustand/vanilla'

import type { AppError } from '../result/AppError'

/**
 * Bối cảnh truyền vào mỗi lần xử lý intent.
 *
 * Đây là toàn bộ những gì `handleIntent` được phép làm: đọc state, thay state,
 * phát effect, và biết mình đã bị huỷ hay chưa. Không có `router`, không có
 * `setTimeout` tự do, không có đường vòng ra ngoài.
 */
export interface IntentContext<S, E, I = never> {
  /**
   * Bị huỷ khi ViewModel bị dispose, hoặc khi một intent mới cùng khoá tới.
   * Truyền vào `fetch(url, { signal })` để công việc dở dang dừng theo.
   */
  readonly signal: AbortSignal
  getState(): S
  /** Cập nhật bất biến. Không sửa tại chỗ. */
  setState(reducer: (current: S) => S): void
  emit(effect: E): void
  /**
   * Bắn một intent vào chính ViewModel này — đi đúng đường `onIntent`, nên
   * nhận đúng khoá gộp của intent đó.
   *
   * Dành cho một luồng sống lâu (theo dõi thiết bị) cần kích một việc thuộc
   * KHOÁ KHÁC (nạp app cho máy vừa tự chọn): việc đó phải huỷ được bởi thao
   * tác người dùng cùng khoá, mà luồng thì không được chết theo. Không có
   * `dispatch`, cách còn lại là giữ một `AbortController` con rồi tự huỷ tay —
   * đúng cái luật 6 cấm. Không dùng để gọi dây chuyền trong `handleIntent`
   * thường: ở đó gọi thẳng hàm là đủ và dễ theo dõi hơn.
   */
  dispatch(intent: I): void
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
  handleIntent(intent: I, ctx: IntentContext<S, E, I>, deps: D): void | Promise<void>

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
  onError?(error: AppError, intent: I, ctx: IntentContext<S, E, I>, deps: D): void

  /**
   * Chạy một lần khi ViewModel khởi động (`start()`). Nơi nạp dữ liệu ban đầu.
   *
   * Có thể trả `Promise` — một luồng mở ở đây (logcat, mirror) sống tới khi
   * bị huỷ, và chỉ huỷ được nếu khai `startKey`.
   */
  onStart?(ctx: IntentContext<S, E, I>, deps: D): void | Promise<void>

  /**
   * Khoá gộp của job `onStart`, cùng không gian tên với `intentKey`.
   *
   * Không có nó thì job khởi động không nằm trong bảng job đang chạy, và intent
   * "Dừng"/"Đổi tham số" cùng khoá KHÔNG huỷ được luồng mở lúc khởi động: màn
   * hình báo đã dừng nhưng fetch vẫn chảy, và lượt mở lại nhận 409 vì phiên
   * cũ còn giữ máy. ViewModel nào mở luồng trong `onStart` phải khai khoá này.
   */
  readonly startKey?: string
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
  /**
   * Chạy `onStart`. Gọi lần hai (hoặc sau `dispose`) là no-op.
   *
   * Tách khỏi lúc dựng để Provider gọi được trong `useEffect` — nơi StrictMode
   * gỡ/gắn lại có `dispose()` đi kèm. Dựng trong `useState(() => …)` thì
   * StrictMode gọi initializer hai lần và vứt một kết quả: một ViewModel mồ côi
   * đã mở luồng mà không ai huỷ được.
   */
  start(): void
  /** Gắn người tiêu thụ Effect. Chỉ một. */
  connectEffects(consumer: (effect: E) => void): () => void
  dispose(): void
  readonly isDisposed: boolean
  readonly name: string
}
