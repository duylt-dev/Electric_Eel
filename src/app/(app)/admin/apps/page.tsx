import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { requireAdmin } from '@/lib/session'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { CreateAppDialog } from './AppForms'
import { AppTable } from './AppTable'

export const metadata: Metadata = { title: 'Dự án' }

export default async function AdminAppsPage() {
  const admin = await requireAdmin()
  if (!admin.ok) return <Alert severity="error">{admin.error.message}</Alert>

  const apps = await serverContainer.appDirectory.listAppsForUser(admin.value)

  return (
    <Box>
      <SectionHeading
        title="Project Firebase"
        hint="Mỗi project cần một service account thì công cụ mới đọc và ghi Remote Config được."
        actions={<CreateAppDialog />}
      />

      {!apps.ok ? <Alert severity="error">{apps.error.message}</Alert> : <AppTable apps={apps.value} />}
    </Box>
  )
}
