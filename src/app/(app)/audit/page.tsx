import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import type { AuditAction } from '@/domain/identity/repositories/AuditLogRepository'
import { requireUser } from '@/lib/session'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { Scroller } from '@/ui/components/Scroller'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'

export const metadata: Metadata = { title: 'Nhật ký' }

const ACTION_LABEL: Record<AuditAction, string> = {
  TEMPLATE_FETCH: 'Tải cấu hình',
  TEMPLATE_VALIDATE: 'Kiểm tra cấu hình',
  TEMPLATE_PUBLISH: 'Đẩy lên Firebase',
  APP_CREATE: 'Tạo app',
  APP_PACKAGE_SET: 'Đổi package name',
  APP_CREDENTIAL_SET: 'Gắn service account',
  APP_CREDENTIAL_REMOVE: 'Gỡ service account',
  APP_MEMBERSHIP_SET: 'Đổi phân quyền',
  USER_CREATE: 'Tạo tài khoản',
  USER_DEACTIVATE: 'Đổi trạng thái tài khoản',
  USER_PASSWORD_CHANGE: 'Đổi mật khẩu',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGIN_THROTTLED: 'Bị chặn vì thử quá nhiều',
  LOGIN_SUCCEEDED: 'Đăng nhập',
}

const formatTime = (value: Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)

/**
 * Nhật ký thao tác.
 *
 * Người thường chỉ thấy việc của chính mình; quản trị thấy tất cả. Không phải
 * vì thao tác của người khác là bí mật, mà vì danh sách đầy đủ với một người
 * không có quyền quản trị thì vừa dài vừa không dùng được vào việc gì.
 */
export default async function AuditPage() {
  const user = await requireUser()
  if (!user.ok) return <Alert severity="error">{user.error.message}</Alert>

  const entries = await serverContainer.audit.list(
    user.value.role === 'ADMIN' ? { limit: 200 } : { userId: user.value.id, limit: 200 },
  )
  if (!entries.ok) return <Alert severity="error">{entries.error.message}</Alert>

  const failed = entries.value.filter((entry) => !entry.succeeded).length

  return (
    <>
      <PageHeader
        eyebrow="Nhật ký"
        title="Thao tác gần đây"
        subtitle={
          user.value.role === 'ADMIN'
            ? 'Toàn bộ thao tác của mọi người trên mọi app, mới nhất trước.'
            : 'Thao tác của chính bạn, mới nhất trước.'
        }
        meta={
          <>
            <MetaChip label="bản ghi">{entries.value.length}</MetaChip>
            <MetaChip label="hỏng">{failed}</MetaChip>
            <MetaChip label="phạm vi">{user.value.role === 'ADMIN' ? 'toàn hệ thống' : 'cá nhân'}</MetaChip>
          </>
        }
      />

      <Scroller>
        <Table size="small" sx={{ minWidth: 860 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 170 }}>Thời điểm</TableCell>
              <TableCell sx={{ width: 200 }}>Thao tác</TableCell>
              <TableCell sx={{ width: 180 }}>Người thực hiện</TableCell>
              <TableCell sx={{ width: 140 }}>App</TableCell>
              <TableCell sx={{ width: 130 }}>Từ đâu</TableCell>
              <TableCell>Chi tiết</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.value.map((entry) => (
              <TableRow key={entry.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(entry.createdAt)}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    {!entry.succeeded && <StatusChip tone="bad">hỏng</StatusChip>}
                    <Typography variant="body2">{ACTION_LABEL[entry.action] ?? entry.action}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>{entry.userName ?? '—'}</TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT_STACK, fontSize: 12 }}>{entry.appSlug ?? '—'}</TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT_STACK, fontSize: 12 }}>
                  {/* User-Agent đầy đủ nằm ở tooltip: nó dài tới mức chèn
                      thẳng vào bảng sẽ đẩy mọi cột khác ra ngoài màn hình. */}
                  <Tooltip title={entry.userAgent ?? 'Không rõ trình duyệt'}>
                    <span>{entry.ipAddress ?? '—'}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
                    {[entry.targetKey, entry.detail].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}

            {entries.value.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 3 }}>
                    Chưa có thao tác nào được ghi lại.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Scroller>
    </>
  )
}
