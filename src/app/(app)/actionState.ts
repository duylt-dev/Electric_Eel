/**
 * Trạng thái trả về của các server action trong khu vực đã đăng nhập.
 *
 * Vì sao nằm ở file riêng chứ không nằm cùng `actions.ts`: mọi export của một
 * module `'use server'` đều bị Next đổi thành *tham chiếu tới hàm phía server*.
 * Với một hàm thì đó đúng là điều mình muốn; với một hằng như `idleState` thì
 * phía trình duyệt nhận về một cái proxy, không phải `{ message: null }` — nên
 * `state.message === null` là sai, và biểu mẫu hiện một khối báo lỗi RỖNG ngay
 * lần vẽ đầu tiên. Không có lỗi nào được ném ra, chỉ có một khối đỏ trống.
 *
 * Quy tắc rút ra: file `'use server'` chỉ export hàm async. Mọi thứ khác — kiểu,
 * hằng, hàm tiện ích — nằm ở một module thường như file này.
 */
export interface ActionState {
  message: string | null
  ok: boolean
}

export const idleState: ActionState = { message: null, ok: true }

export const failure = (message: string): ActionState => ({ message, ok: false })
export const success = (message: string): ActionState => ({ message, ok: true })
