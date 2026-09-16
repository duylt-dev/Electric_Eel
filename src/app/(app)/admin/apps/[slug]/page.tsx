import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import type { AppRole } from '@/domain/identity/entities/Permission'
import { requireAdmin } from '@/lib/session'
import { LinkIconButton } from '@/ui/components/NavLink'
import { PageHeader } from '@/ui/components/PageHeader'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import { CredentialForm, MembershipForm, PackageNameForm } from './AppCredentialForms'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return { title: `Cấu hình ${slug}` }
}

const panelSx = {
  p: 6,
  // Giới hạn bề ngang: một biểu mẫu trải hết 1240px thì mắt phải nhảy quá xa
  // từ nhãn sang ô nhập, và người dùng đọc nhầm dòng.
  maxWidth: 760,
  borderRadius: `${m3Shape.large}px`,
  bgcolor: m3('surfaceContainerLow'),
  border: `1px solid ${m3('outlineVariant')}`,
} as const

export default async function AppAdminPage({ params }: PageProps) {
  const { slug } = await params

  const admin = await requireAdmin()
  if (!admin.ok) return <Alert severity="error">{admin.error.message}</Alert>

  const found = await serverContainer.appDirectory.getAppForUser(admin.value, slug)
  if (!found.ok) return <Alert severity="error">{found.error.message}</Alert>

  const app = found.value.app

  const [allUsers, memberships] = await Promise.all([
    serverContainer.users.listUsers(),
    serverContainer.appDirectory.listMemberships(app.id),
  ])

  const roleByUser = new Map<string, AppRole>(
    (memberships.ok ? memberships.value : []).map((entry) => [entry.user.id, entry.role]),
  )

  const users = (allUsers.ok ? allUsers.value : [])
    .filter((user) => user.isActive)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: roleByUser.get(user.id) ?? null,
    }))

  return (
    <>
      <PageHeader>
        <Tooltip title="Về danh sách project">
          <LinkIconButton href="/admin/apps" size="small" aria-label="Về danh sách project">
            <ArrowBackIcon fontSize="small" />
          </LinkIconButton>
        </Tooltip>
      </PageHeader>

      <Stack spacing={7}>
        <Box sx={panelSx}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Service account
          </Typography>
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), display: 'block', mb: 4 }}>
            {app.hasCredential
              ? `Đang dùng ${app.credentialClientEmail ?? 'không rõ'}`
              : 'Chưa gắn. Tool chưa đọc được cấu hình của project này.'}
          </Typography>
          <CredentialForm slug={app.slug} hasCredential={app.hasCredential} />
        </Box>

        <Box sx={panelSx}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Package name
          </Typography>
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), display: 'block', mb: 4 }}>
            applicationId của app trên Play Console. Đây là từ khoá tìm app ở màn chọn app, cạnh tên
            hiển thị và Project ID.
          </Typography>
          <PackageNameForm slug={app.slug} packageName={app.packageName} />
        </Box>

        <Box sx={panelSx}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Phân quyền
          </Typography>
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), display: 'block', mb: 4 }}>
            Quản trị hệ thống luôn có toàn quyền trên mọi app, không cần cấp ở đây.
          </Typography>

          {!memberships.ok ? (
            <Alert severity="error">{memberships.error.message}</Alert>
          ) : (
            <MembershipForm appId={app.id} slug={app.slug} users={users} />
          )}
        </Box>
      </Stack>
    </>
  )
}
