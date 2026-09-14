import Alert from '@mui/material/Alert'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { MirrorPickerRoot } from '@/features/mirror-picker/MirrorPickerRoot'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Màn hình máy' }

/**
 * Cửa vào công cụ Màn hình máy.
 *
 * Trang chỉ lo hai việc: kiểm quyền và kiểm xem công cụ có bật không. Danh
 * sách thiết bị KHÔNG đọc ở đây — nó đến từ adb, đổi theo từng giây (cắm cáp,
 * rút cáp), nên đọc lúc dựng trang chỉ là một ảnh chụp đã cũ (giống
 * `logcat/page.tsx`).
 *
 * Kiểm CẢ HAI cấu hình (`adb` lẫn `deviceMirror`) trước khi dựng client
 * component: `adb` cần bật để thấy máy, `deviceMirror` cần `scrcpy-server`
 * trên máy chủ để mở được luồng — thiếu cái nào thì người dùng cần biết NGAY,
 * trước khi ngồi chờ một danh sách máy không bao giờ mở ra được gì.
 */
export default async function MirrorPickerPage() {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const adbSettings = serverContainer.adb.settings()
  if (!adbSettings.ok) {
    return <Alert severity="warning">{adbSettings.error.message}</Alert>
  }

  const mirrorSettings = serverContainer.deviceMirror.settings()
  if (!mirrorSettings.ok) {
    return <Alert severity="warning">{mirrorSettings.error.message}</Alert>
  }

  return <MirrorPickerRoot />
}
