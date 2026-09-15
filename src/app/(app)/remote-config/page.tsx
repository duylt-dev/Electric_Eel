import CloudOffIcon from '@mui/icons-material/CloudOff'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { requireUser } from '@/lib/session'
import { m3 } from '@/ui/theme/m3Tokens'
import { AppPicker } from './AppPicker'

export const metadata: Metadata = { title: 'Chọn app' }

/** Danh sách app người dùng được phép mở. Cửa vào của công cụ Remote Config. */
export default async function RemoteConfigIndexPage() {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const apps = await serverContainer.appDirectory.listAppsForUser(user.value)
  if (!apps.ok) {
    return <Alert severity="error">{apps.error.message}</Alert>
  }

  if (apps.value.length === 0) {
    return (
      <>
        <Stack spacing={4} sx={{ alignItems: 'center', py: 16, textAlign: 'center' }}>
          <CloudOffIcon sx={{ fontSize: 44, color: m3('outline') }} />
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
            Danh sách app sẽ hiện ở đây ngay khi bạn được cấp quyền.
          </Typography>
        </Stack>
      </>
    )
  }

  return (
    <>
      {/* Danh sách và ô tìm kiếm chạy ở trình duyệt; trang này chỉ lo quyền và dữ liệu. */}
      <AppPicker apps={apps.value} />
    </>
  )
}
