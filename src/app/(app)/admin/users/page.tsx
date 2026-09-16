import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { requireAdmin } from '@/lib/session'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { CreateUserDialog } from './UserForms'
import { UserTable } from './UserTable'

export const metadata: Metadata = { title: 'Tài khoản' }

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  if (!admin.ok) return <Alert severity="error">{admin.error.message}</Alert>

  const users = await serverContainer.users.listUsers()

  return (
    <Box>
      <SectionHeading
        title="Tài khoản"
        hint="Khoá một tài khoản thì người đó mất quyền trên mọi app ngay lập tức, nhưng nhật ký thao tác cũ vẫn giữ nguyên."
        actions={<CreateUserDialog />}
      />

      {!users.ok ? (
        <Alert severity="error">{users.error.message}</Alert>
      ) : (
        <UserTable users={users.value} currentUserId={admin.value.id} />
      )}
    </Box>
  )
}
