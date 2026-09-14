import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { isSafeSerial } from '@/domain/adb/entities/AdbDevice'
import { DeviceMirrorRoot } from '@/features/device-mirror/DeviceMirrorRoot'
import { requireUser } from '@/lib/session'
import { LinkButton } from '@/ui/components/NavLink'

interface PageProps {
  params: Promise<{ serial: string }>
}

/** `decodeURIComponent` NÉM với `%E0%A4%A` (escape cụt) → trang 500 thay vì "không hợp lệ". */
const decodeSerial = (raw: string): string => {
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return ''
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { serial } = await params
  return { title: `Màn hình máy · ${decodeSerial(serial)}` }
}

/**
 * Màn mirror một thiết bị.
 *
 * `serial` đi qua URL chứ không qua state trong bộ nhớ — mở lại được sau khi
 * tải lại trang, dán được cho đồng nghiệp, và mở được nhiều tab cho nhiều máy
 * cùng lúc (giống `logcat/[package]/page.tsx`).
 *
 * `serial` đến từ URL, tức là từ chỗ bất kỳ ai cũng gõ được, và nó sẽ trở
 * thành tham số của một tiến trình `app_process` trên máy chủ — nên chỗ chặn
 * (`isSafeSerial`) phải ở ngay cửa, đừng để nó đi sâu thêm một tầng nào.
 */
export default async function DeviceMirrorPage({ params }: PageProps) {
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

  const { serial: rawSerial } = await params
  const serial = decodeSerial(rawSerial)

  if (!isSafeSerial(serial)) {
    return (
      <Stack spacing={4} sx={{ maxWidth: 640 }}>
        <Alert severity="error">Đường dẫn không hợp lệ.</Alert>
        <LinkButton href="/mirror" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
          Về danh sách máy
        </LinkButton>
      </Stack>
    )
  }

  return (
    // `key` buộc dựng lại ViewModel + sink khi đổi máy: một luồng cũ còn chảy
    // vào canvas của máy mới là kiểu lỗi rất khó nhìn ra.
    <DeviceMirrorRoot key={serial} serial={serial} />
  )
}
