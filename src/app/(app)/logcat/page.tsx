import Alert from '@mui/material/Alert'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { LogcatPickerRoot } from '@/features/logcat-picker/LogcatPickerRoot'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Logcat' }

/**
 * Cửa vào công cụ Logcat.
 *
 * Trang chỉ lo ba việc: kiểm quyền, quyết định đường tới thiết bị, và đưa danh
 * bạ app xuống màn hình. Danh sách thiết bị và danh sách app KHÔNG đọc ở đây —
 * chúng đến từ adb, thay đổi theo từng giây (cắm cáp, rút cáp), nên đọc lúc
 * dựng trang là đảm bảo hiển thị một ảnh chụp đã cũ.
 *
 * Đường tới thiết bị (`access`) thì ngược lại: chỉ máy chủ biết `ADB_ENABLED`,
 * và trình duyệt cần biết nó TRƯỚC khi dựng ViewModel — hai đường là hai
 * adapter khác nhau, không đổi được giữa chừng.
 */
export default async function LogcatPickerPage() {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const access = serverContainer.adb.access()

  const apps = await serverContainer.appDirectory.listAppsForUser(user.value)

  // Danh bạ hỏng không đáng chặn cả công cụ: thiếu nó thì app trên máy hiện
  // package name thay vì tên đội đặt, và mọi thứ còn lại vẫn dùng được.
  const directory = apps.ok
    ? apps.value.map((app) => ({
        slug: app.slug,
        displayName: app.displayName,
        packageName: app.packageName,
      }))
    : []

  return <LogcatPickerRoot access={access} directory={directory} />
}
