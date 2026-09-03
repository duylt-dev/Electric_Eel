import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { isSafeSerial } from '@/domain/adb/entities/AdbDevice'
import { isSafePackageName } from '@/domain/adb/entities/AndroidPackage'
import { AdbLogcatRoot } from '@/features/adb-logcat/AdbLogcatRoot'
import { requireUser } from '@/lib/session'
import { LinkButton } from '@/ui/components/NavLink'

interface PageProps {
  params: Promise<{ package: string }>
  searchParams: Promise<{ serial?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { package: packageName } = await params
  return { title: `Logcat · ${decodeURIComponent(packageName)}` }
}

/**
 * Màn log của một app.
 *
 * `serial` đi qua query string chứ không qua state trong bộ nhớ, và đó là chủ
 * ý: một đường dẫn đầy đủ mở lại được sau khi tải lại trang, dán được cho đồng
 * nghiệp ngồi cùng mạng, và mở được hai tab cho hai máy để so log của cùng một
 * app trên hai đời Android.
 *
 * Cả hai tham số đều được kiểm ngay tại đây. Chúng đến từ URL, tức là từ chỗ
 * bất kỳ ai cũng gõ được, và chúng sẽ trở thành tham số của một tiến trình —
 * nên chỗ chặn phải ở ngay cửa, đừng để nó đi sâu thêm một tầng nào.
 */
export default async function AdbLogcatPage({ params, searchParams }: PageProps) {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const settings = serverContainer.adb.settings()
  if (!settings.ok) {
    return <Alert severity="warning">{settings.error.message}</Alert>
  }

  const { package: rawPackage } = await params
  const { serial: rawSerial } = await searchParams

  const packageName = decodeURIComponent(rawPackage).trim()
  const serial = (rawSerial ?? '').trim()

  if (!isSafePackageName(packageName) || !isSafeSerial(serial)) {
    return (
      <Stack spacing={4} sx={{ maxWidth: 640 }}>
        <Alert severity="error">
          {serial.length === 0
            ? 'Đường dẫn này thiếu thiết bị. Chọn lại app từ danh sách để mở đúng máy.'
            : 'Đường dẫn không hợp lệ.'}
        </Alert>
        <LinkButton href="/logcat" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
          Về danh sách app
        </LinkButton>
      </Stack>
    )
  }

  const apps = await serverContainer.appDirectory.listAppsForUser(user.value)
  const appName = apps.ok
    ? (apps.value.find((app) => app.packageName === packageName)?.displayName ?? null)
    : null

  return (
    // `key` buộc dựng lại ViewModel khi đổi app hoặc đổi máy: đệm log của lượt
    // trước không còn nghĩa gì, và một luồng cũ còn chảy vào màn hình mới là
    // kiểu lỗi rất khó nhìn ra.
    <AdbLogcatRoot
      key={`${serial}:${packageName}`}
      serial={serial}
      packageName={packageName}
      appName={appName}
    />
  )
}
