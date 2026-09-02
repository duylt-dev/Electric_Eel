/**
 * Trạng thái của biểu mẫu đăng nhập.
 *
 * Nằm riêng khỏi `actions.ts` vì mọi export của một module `'use server'` đều
 * bị Next đổi thành tham chiếu tới hàm phía server — kể cả một `interface` thì
 * cũng buộc file phải là module thường để `useActionState` dùng được kiểu.
 * Cùng lý do với `(app)/actionState.ts`.
 */
export interface LoginFormState {
  message: string | null
}

export const idleLoginState: LoginFormState = { message: null }
