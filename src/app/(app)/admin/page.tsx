import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { GLOBAL_ROLE_LABEL } from '@/domain/identity/entities/Permission'
import { requireAdmin } from '@/lib/session'
import { MetaChip } from '@/ui/components/MetaChip'
import { LinkButton } from '@/ui/components/NavLink'
import { PageHeader } from '@/ui/components/PageHeader'
import { Scroller } from '@/ui/components/Scroller'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'
import { CreateAppForm, CreateUserForm, ToggleUserButton } from './AdminForms'

export const metadata: Metadata = { title: 'Quản trị' }

export default async function AdminPage() {
  const admin = await requireAdmin()
  if (!admin.ok) return <Alert severity="error">{admin.error.message}</Alert>

  const [apps, users] = await Promise.all([
    serverContainer.appDirectory.listAppsForUser(admin.value),
    serverContainer.users.listUsers(),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Quản trị"
        title="Tài khoản và project"
        subtitle="Thêm project Firebase, gắn service account, và quyết định ai được sửa app nào."
        meta={
          <>
            <MetaChip label="project">{apps.ok ? apps.value.length : '—'}</MetaChip>
            <MetaChip label="tài khoản">{users.ok ? users.value.length : '—'}</MetaChip>
          </>
        }
      />

      <Stack spacing={10}>
        <Box>
          <SectionHeading
            title="Project Firebase"
            hint="Mỗi project cần một service account thì công cụ mới đọc và ghi Remote Config được."
          />

          {!apps.ok ? (
            <Alert severity="error">{apps.error.message}</Alert>
          ) : (
            <Scroller sx={{ mb: 5 }}>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Tên</TableCell>
                    <TableCell>Project ID</TableCell>
                    <TableCell>Service account</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {apps.value.map((app) => (
                    <TableRow key={app.id} hover>
                      <TableCell>
                        <Typography variant="body2">{app.displayName}</Typography>
                        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), fontFamily: MONO_FONT_STACK }}>
                          /{app.slug}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT_STACK, fontSize: 13 }}>{app.projectId}</TableCell>
                      <TableCell>
                        {app.hasCredential ? (
                          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                            <StatusChip tone="ok" dot>
                              đã gắn
                            </StatusChip>
                            <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), fontFamily: MONO_FONT_STACK }}>
                              {app.credentialClientEmail}
                            </Typography>
                          </Stack>
                        ) : (
                          <StatusChip tone="bad" dot>
                            chưa gắn
                          </StatusChip>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <LinkButton href={`/admin/apps/${app.slug}`} size="small">
                          Cấu hình
                        </LinkButton>
                      </TableCell>
                    </TableRow>
                  ))}

                  {apps.value.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 3 }}>
                          Chưa có project nào.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Scroller>
          )}

          <CreateAppForm />
        </Box>

        <Box>
          <SectionHeading
            title="Tài khoản"
            hint="Khoá một tài khoản thì người đó mất quyền trên mọi app ngay lập tức, nhưng nhật ký thao tác cũ vẫn giữ nguyên."
          />

          {!users.ok ? (
            <Alert severity="error">{users.error.message}</Alert>
          ) : (
            <Scroller sx={{ mb: 5 }}>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Người dùng</TableCell>
                    <TableCell>Vai trò hệ thống</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.value.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography variant="body2">{user.name}</Typography>
                        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
                          {user.email}
                        </Typography>
                      </TableCell>
                      <TableCell>{GLOBAL_ROLE_LABEL[user.role]}</TableCell>
                      <TableCell>
                        <StatusChip tone={user.isActive ? 'ok' : 'neutral'} dot>
                          {user.isActive ? 'đang hoạt động' : 'đã khoá'}
                        </StatusChip>
                      </TableCell>
                      <TableCell align="right">
                        <ToggleUserButton
                          userId={user.id}
                          isActive={user.isActive}
                          disabled={user.id === admin.value.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Scroller>
          )}

          <CreateUserForm />
        </Box>
      </Stack>
    </>
  )
}
