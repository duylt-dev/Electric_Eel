'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'

import { GLOBAL_ROLE_LABEL, GLOBAL_ROLES } from '@/domain/identity/entities/Permission'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import { idleState } from '../actionState'
import { createAppAction, createUserAction, setUserActiveAction } from './actions'

const panelSx = {
  p: 6,
  // Giới hạn bề ngang: một biểu mẫu trải hết 1240px thì mắt phải nhảy quá xa
  // từ nhãn sang ô nhập, và người dùng đọc nhầm dòng.
  maxWidth: 760,
  borderRadius: `${m3Shape.large}px`,
  bgcolor: m3('surfaceContainerLow'),
  border: `1px solid ${m3('outlineVariant')}`,
} as const

function ActionMessage({ state }: { state: { message: string | null; ok: boolean } }) {
  if (state.message === null) return null
  return <Alert severity={state.ok ? 'success' : 'error'}>{state.message}</Alert>
}

export function CreateAppForm() {
  const [state, action, pending] = useActionState(createAppAction, idleState)

  return (
    <Box component="form" action={action} sx={panelSx}>
      <Typography variant="subtitle1">Thêm project Firebase</Typography>
      <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
        Tạo bản ghi trước, gắn service account sau.
      </Typography>

      <Stack spacing={4} sx={{ mt: 4, maxWidth: 460 }}>
        <ActionMessage state={state} />
        <TextField
          name="displayName"
          label="Tên hiển thị"
          required
          fullWidth
          helperText="Tên đội ngũ dùng để gọi app này."
        />
        <TextField
          name="projectId"
          label="Firebase Project ID"
          required
          fullWidth
          helperText="Lấy trong Firebase Console › Project settings. Không phải tên project."
        />
        <TextField
          name="slug"
          label="Định danh trên URL"
          required
          fullWidth
          helperText="Chữ thường, số và gạch ngang. Ví dụ: love-test"
        />
        <TextField
          name="packageName"
          label="Package name"
          fullWidth
          placeholder="com.pion.lovetest"
          helperText="Bỏ trống cũng được, điền sau ở trang chi tiết app. Chưa điền thì tìm app bằng package name sẽ không ra."
        />
        <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }}>
          {pending ? 'Đang tạo…' : 'Tạo app'}
        </Button>
      </Stack>
    </Box>
  )
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, idleState)

  return (
    <Box component="form" action={action} sx={panelSx}>
      <Typography variant="subtitle1">Thêm tài khoản</Typography>
      <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
        Tài khoản nội bộ. Người dùng đổi mật khẩu sau khi đăng nhập lần đầu.
      </Typography>

      <Stack spacing={4} sx={{ mt: 4, maxWidth: 460 }}>
        <ActionMessage state={state} />
        <TextField name="name" label="Họ tên" required fullWidth />
        <TextField name="email" type="email" label="Email" required fullWidth />
        <TextField
          name="password"
          type="password"
          label="Mật khẩu tạm"
          required
          fullWidth
          helperText="Ít nhất 8 ký tự."
        />
        <TextField select name="role" label="Vai trò hệ thống" defaultValue="MEMBER" fullWidth>
          {GLOBAL_ROLES.map((role) => (
            <MenuItem key={role} value={role}>
              {GLOBAL_ROLE_LABEL[role]}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }}>
          {pending ? 'Đang tạo…' : 'Tạo tài khoản'}
        </Button>
      </Stack>
    </Box>
  )
}

export function ToggleUserButton({
  userId,
  isActive,
  disabled,
}: {
  userId: string
  isActive: boolean
  disabled?: boolean
}) {
  const [state, action, pending] = useActionState(setUserActiveAction, idleState)

  return (
    <Box component="form" action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
      <Button type="submit" size="small" color={isActive ? 'error' : 'primary'} disabled={pending || disabled}>
        {isActive ? 'Khoá' : 'Mở lại'}
      </Button>
      {state.message !== null && !state.ok && (
        <Typography variant="caption" sx={{ color: m3('error'), display: 'block' }}>
          {state.message}
        </Typography>
      )}
    </Box>
  )
}
