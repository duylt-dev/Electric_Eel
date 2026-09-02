'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useActionState } from 'react'

import { m3, m3Mono } from '@/ui/theme/m3Tokens'
import { loginAction } from './actions'
import { idleLoginState } from './formState'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, idleLoginState)

  return (
    <Box
      component="form"
      action={formAction}
      sx={{ width: '100%', maxWidth: 360 }}
    >
      <Stack spacing={5}>
        <Box>
          <Typography sx={{ ...m3Mono.eyebrow, color: m3('primary'), mb: 2 }}>Đăng nhập</Typography>
          <Typography variant="h3">Tài khoản nội bộ</Typography>
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 2 }}>
            Tài khoản do quản trị viên tạo. Không dùng tài khoản Google.
          </Typography>
        </Box>

        {state.message !== null && <Alert severity="error">{state.message}</Alert>}

        <TextField
          name="email"
          type="email"
          label="Email"
          autoComplete="username"
          required
          fullWidth
          autoFocus
        />
        <TextField
          name="password"
          type="password"
          label="Mật khẩu"
          autoComplete="current-password"
          required
          fullWidth
        />

        <Button type="submit" variant="contained" size="large" disabled={pending} fullWidth>
          {pending ? 'Đang kiểm tra…' : 'Đăng nhập'}
        </Button>
      </Stack>
    </Box>
  )
}
