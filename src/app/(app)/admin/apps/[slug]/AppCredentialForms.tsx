'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState, useState } from 'react'

import { APP_ROLE_DESCRIPTION, APP_ROLE_LABEL, APP_ROLES } from '@/domain/identity/entities/Permission'
import type { AppRole } from '@/domain/identity/entities/Permission'
import { m3 } from '@/ui/theme/m3Tokens'
import { idleState } from '../../../actionState'
import {
  removeCredentialAction,
  setCredentialAction,
  setMembershipAction,
  setPackageNameAction,
} from '../../actions'

/**
 * Ô chọn tệp bị ẩn sau nút, nên nếu không in tên tệp ra thì chọn xong màn hình
 * đứng yên và người dùng không biết mình đã chọn đúng tệp hay chưa — chỉ biết
 * sau khi bấm lưu và nhận lỗi.
 */
export function CredentialForm({ slug, hasCredential }: { slug: string; hasCredential: boolean }) {
  const [state, action, pending] = useActionState(setCredentialAction, idleState)
  const [removeState, removeAction, removing] = useActionState(removeCredentialAction, idleState)
  const [fileName, setFileName] = useState<string | null>(null)

  return (
    <Stack spacing={4}>
      {state.message !== null && <Alert severity={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
      {removeState.message !== null && (
        <Alert severity={removeState.ok ? 'success' : 'error'}>{removeState.message}</Alert>
      )}

      <Box component="form" action={action}>
        <input type="hidden" name="slug" value={slug} />
        <Stack spacing={3}>
          <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined">
              Chọn tệp service account JSON
              <input
                type="file"
                name="serviceAccount"
                accept="application/json,.json"
                hidden
                required
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
            </Button>
            <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
              {fileName ?? 'Chưa chọn tệp nào'}
            </Typography>
          </Stack>
          {fileName !== null && fileName.startsWith('google-services') && (
            <Alert severity="warning">
              <code>google-services.json</code> là cấu hình cho app Android, không phải service account —
              tệp này không có khoá ký nên lưu sẽ bị từ chối. Tệp cần dùng là bản tải về từ{' '}
              <strong>Generate new private key</strong>, tên thường có dạng{' '}
              <code>{'<project>-<mã>.json'}</code>.
            </Alert>
          )}
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), maxWidth: '72ch' }}>
            Firebase Console › Project settings › Service accounts › Generate new private key. Tài khoản đó
            cần vai trò <strong>Firebase Remote Config Admin</strong>. Tệp được mã hoá AES-256-GCM trước
            khi ghi xuống cơ sở dữ liệu và không bao giờ gửi xuống trình duyệt.
          </Typography>
          <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }}>
            {pending ? 'Đang lưu…' : hasCredential ? 'Thay service account' : 'Lưu service account'}
          </Button>
        </Stack>
      </Box>

      {hasCredential && (
        <Box component="form" action={removeAction}>
          <input type="hidden" name="slug" value={slug} />
          <Button type="submit" color="error" size="small" disabled={removing}>
            Gỡ service account
          </Button>
        </Box>
      )}
    </Stack>
  )
}

/**
 * Sửa package name của app đã tạo.
 *
 * Ô này để trống được: xoá đi rồi lưu là gỡ package name. Đổi lại, app đó
 * không còn tìm thấy bằng package name ở màn chọn app nữa — nên chữ dưới ô nói
 * đúng điều đó thay vì nhắc lại tên trường.
 */
export function PackageNameForm({
  slug,
  packageName,
}: {
  slug: string
  packageName: string | null
}) {
  const [state, action, pending] = useActionState(setPackageNameAction, idleState)

  return (
    <Box component="form" action={action}>
      {state.message !== null && (
        <Alert severity={state.ok ? 'success' : 'error'} sx={{ mb: 4 }}>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="slug" value={slug} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'flex-start' }}>
        <TextField
          name="packageName"
          label="Package name"
          defaultValue={packageName ?? ''}
          placeholder="com.pion.lovetest"
          sx={{ width: '100%', maxWidth: 380 }}
          helperText="Để trống là gỡ bỏ. Gỡ rồi thì màn chọn app không tìm ra app này bằng package name nữa."
        />
        <Button type="submit" variant="contained" disabled={pending} sx={{ mt: 1 }}>
          {pending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </Stack>
    </Box>
  )
}

export function MembershipForm({
  appId,
  slug,
  users,
}: {
  appId: string
  slug: string
  users: readonly { id: string; name: string; email: string; role: AppRole | null }[]
}) {
  const [state, action, pending] = useActionState(setMembershipAction, idleState)

  return (
    <Stack spacing={4}>
      {state.message !== null && <Alert severity={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <Stack spacing={3}>
        {users.map((user) => (
          <Box
            key={user.id}
            component="form"
            action={action}
            sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input type="hidden" name="appId" value={appId} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="userId" value={user.id} />

            <Box sx={{ minWidth: 220 }}>
              <Typography variant="body2">{user.name}</Typography>
              <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
                {user.email}
              </Typography>
            </Box>

            <TextField
              select
              name="role"
              label="Quyền trên app này"
              defaultValue={user.role ?? 'none'}
              size="small"
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="none">Không có quyền</MenuItem>
              {APP_ROLES.map((role) => (
                <MenuItem key={role} value={role}>
                  {APP_ROLE_LABEL[role]}
                </MenuItem>
              ))}
            </TextField>

            <Button type="submit" size="small" disabled={pending}>
              Lưu
            </Button>
          </Box>
        ))}
      </Stack>

      <Box>
        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
          {APP_ROLES.map((role) => `${APP_ROLE_LABEL[role]}: ${APP_ROLE_DESCRIPTION[role]}`).join(' · ')}
        </Typography>
      </Box>
    </Stack>
  )
}
