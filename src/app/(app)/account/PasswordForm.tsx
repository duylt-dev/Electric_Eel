'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useActionState } from 'react'

import { MIN_PASSWORD_LENGTH } from '@/domain/identity/entities/PasswordPolicy'
import { idleState } from '../actionState'
import { changePasswordAction } from './actions'

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, idleState)

  return (
    // Biểu mẫu không trải hết bề ngang: quá ~460px thì mắt phải nhảy quá xa từ
    // nhãn sang ô nhập.
    <Box component="form" action={action} sx={{ maxWidth: 460 }}>
      <Stack spacing={4}>
        {state.message !== null && (
          <Alert severity={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        )}

        <TextField
          type="password"
          name="currentPassword"
          label="Mật khẩu hiện tại"
          autoComplete="current-password"
          required
          helperText="Nhập lại để chứng minh đây là bạn, không phải người ngồi vào máy bạn đang mở."
        />

        <TextField
          type="password"
          name="newPassword"
          label="Mật khẩu mới"
          autoComplete="new-password"
          required
          helperText={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự, không chứa email hay tên của bạn — đó là những chuỗi bị thử trước tiên.`}
        />

        <TextField
          type="password"
          name="confirmPassword"
          label="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          required
          helperText="Gõ sai ở đây thì bạn sẽ tự khoá mình ra ngoài."
        />

        <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }}>
          {pending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </Button>
      </Stack>
    </Box>
  )
}
