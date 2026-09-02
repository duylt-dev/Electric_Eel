import 'server-only'

import { cache } from 'react'

import { AppErrors, type Result, err, ok } from '@/core/result'
import { serverContainer } from '@/di/server'
import type { FirebaseAppSummary } from '@/domain/identity/entities/FirebaseAppSummary'
import type { AppAccess, AppRole, AuthenticatedUser } from '@/domain/identity/entities/Permission'
import { canEditApp, canPublishApp, canViewApp } from '@/domain/identity/entities/Permission'
import { auth } from './auth'

/**
 * Cửa kiểm soát quyền phía server.
 *
 * Mọi Route Handler và mọi layout đều đi qua đây. Đặt kiểm tra ở một chỗ nghĩa
 * là thêm một màn hình mới không thể vô tình quên kiểm tra — muốn lấy được
 * `user` thì buộc phải gọi hàm đã kiểm tra rồi.
 */

/**
 * Ai đang đăng nhập — theo cơ sở dữ liệu, không theo token.
 *
 * Phiên ở đây là JWT, nên `id`, `email` và `role` trong token là ẢNH CHỤP tại
 * thời điểm đăng nhập và không đổi cho tới khi token hết hạn. Nếu tin vào ảnh
 * chụp đó thì hai nút trong khu quản trị nói dối:
 *
 *   · "Khoá tài khoản" — người bị khoá vẫn dùng được đến hết hạn token.
 *   · Hạ quyền ADMIN → MEMBER — người bị hạ vẫn vào được `/admin` và vẫn đẩy
 *     được cấu hình lên Firebase suốt quãng thời gian đó.
 *
 * Vì vậy mỗi request đọc lại hàng `User`. `findById` trả `null` cho tài khoản
 * đã khoá, và vai trò lấy từ DB chứ không lấy từ token — thu hồi quyền có hiệu
 * lực ngay ở request kế tiếp.
 *
 * Bọc trong `cache()` của React để một lần dựng trang chỉ hỏi DB một lần, dù
 * layout và page cùng gọi. Phạm vi nhớ đúng bằng một request, nên không có cửa
 * sổ nào để một tài khoản vừa bị khoá lọt qua.
 */
export const currentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const session = await auth()
  if (!session?.user?.id) return null

  const fresh = await serverContainer.users.findById(session.user.id)

  // Đọc DB hỏng thì coi như chưa đăng nhập. Ở đây "đóng khi hỏng" không mất gì:
  // mọi trang phía sau đều cần DB, nên cho đi tiếp cũng chỉ hỏng ở bước sau —
  // chỉ khác là hỏng sau khi đã bỏ qua một lần kiểm tra quyền.
  if (!fresh.ok || fresh.value === null) return null

  return fresh.value
})

export async function requireUser(): Promise<Result<AuthenticatedUser>> {
  const user = await currentUser()
  if (user === null) return err(AppErrors.unauthorized('Bạn cần đăng nhập để tiếp tục.'))
  return ok(user)
}

export interface AppContext {
  user: AuthenticatedUser
  app: FirebaseAppSummary
  access: AppAccess | null
}

/**
 * Lấy bối cảnh app và kiểm tra người dùng đủ quyền tối thiểu.
 *
 * `minimumRole` mặc định là VIEWER. Truyền PUBLISHER cho endpoint publish, và
 * đừng bao giờ kiểm tra quyền publish bằng cách ẩn nút trên giao diện — nút
 * ẩn không ngăn được một lệnh gọi API viết tay.
 */
export async function requireAppAccess(
  slug: string,
  minimumRole: AppRole = 'VIEWER',
): Promise<Result<AppContext>> {
  const user = await requireUser()
  if (!user.ok) return user

  const found = await serverContainer.appDirectory.getAppForUser(user.value, slug)
  if (!found.ok) return found

  const { app, access } = found.value
  const allowed =
    minimumRole === 'PUBLISHER'
      ? canPublishApp(user.value, access)
      : minimumRole === 'EDITOR'
        ? canEditApp(user.value, access)
        : canViewApp(user.value, access)

  if (!allowed) {
    return err(
      AppErrors.forbidden(
        minimumRole === 'PUBLISHER'
          ? 'Bạn không có quyền đẩy cấu hình lên Firebase cho app này.'
          : 'Bạn không có quyền sửa cấu hình của app này.',
      ),
    )
  }

  return ok({ user: user.value, app, access })
}

export async function requireAdmin(): Promise<Result<AuthenticatedUser>> {
  const user = await requireUser()
  if (!user.ok) return user
  if (user.value.role !== 'ADMIN') {
    return err(AppErrors.forbidden('Chỉ quản trị hệ thống mới vào được khu vực này.'))
  }
  return ok(user.value)
}
