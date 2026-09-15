/**
 * Quy đổi sự kiện con trỏ/bánh lăn của trình duyệt thành toạ độ chuẩn hoá mà
 * `MirrorControlMessage` cần.
 *
 * Hàm thuần, đặt ở `features/` chứ không phải `domain/`: nó biết về
 * `DOMRect` và quy ước `deltaY` của trình duyệt — hai thứ domain không được
 * biết. Phía máy chủ (`toDevicePoint` ở domain) nhân `nx, ny` với kích cỡ
 * khung hình để ra pixel thật, nên ở đây KHÔNG cần biết máy đang xoay hay
 * không: canvas có kích cỡ nội tại đúng bằng khung hình (xem `MirrorSurface`),
 * không có letterbox, ánh xạ là tuyến tính. Nếu sau này có letterbox thì sửa
 * đúng một hàm này.
 */

export interface PointerLike {
  readonly clientX: number
  readonly clientY: number
}

export interface RectLike {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface NormalizedPoint {
  readonly nx: number
  readonly ny: number
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)
const clampUnit = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value)

/**
 * Vị trí con trỏ so với khung canvas, kẹp về `[0, 1]`.
 *
 * Kẹp thay vì bỏ qua: khi đang kéo mà con trỏ trượt ra ngoài canvas (pointer
 * capture giữ sự kiện lại), máy vẫn phải nhận `move` ở mép — bỏ qua thì cú
 * vuốt kết thúc lơ lửng giữa chừng. Khung rỗng (`width`/`height` = 0) trả về
 * góc trên trái thay vì `NaN`.
 */
export function normalizePointer(pointer: PointerLike, rect: RectLike): NormalizedPoint {
  if (rect.width <= 0 || rect.height <= 0) return { nx: 0, ny: 0 }
  return {
    nx: clamp01((pointer.clientX - rect.left) / rect.width),
    ny: clamp01((pointer.clientY - rect.top) / rect.height),
  }
}

/** Một nấc bánh lăn ở chế độ pixel là ~100 — quy về đúng một "tick" của scrcpy. */
const WHEEL_UNIT = 100

/**
 * `deltaX/deltaY` của sự kiện wheel → `dx/dy` trong `[-1, 1]`.
 *
 * Đảo dấu trục dọc: trình duyệt cho `deltaY > 0` khi lăn XUỐNG (nội dung đi
 * lên), còn Android `AXIS_VSCROLL > 0` nghĩa là lăn LÊN. Trục ngang cùng
 * chiều ở cả hai bên.
 */
export function wheelToScroll(deltaX: number, deltaY: number): { dx: number; dy: number } {
  return {
    dx: clampUnit(deltaX / WHEEL_UNIT),
    dy: clampUnit(-deltaY / WHEEL_UNIT),
  }
}
