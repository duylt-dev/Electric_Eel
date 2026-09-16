'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useActionState, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { m3 } from '@/ui/theme/m3Tokens'
import { idleState } from '../actionState'
import type { ActionState } from '../actionState'

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  hint: string
  submitLabel: string
  pendingLabel?: string
  action: FormAction
  /** Nút gửi màu lỗi — cho xoá và những việc không hoàn tác được. */
  danger?: boolean
  /** Gọi khi action trả về thành công, kèm câu thông báo. Bên gọi đóng hộp và hiện toast. */
  onDone: (message: string) => void
  children: ReactNode
}

/**
 * Hộp thoại chứa một biểu mẫu gọi server action.
 *
 * Vì sao là hộp thoại chứ không phải panel dưới bảng: tạo, sửa, xoá là việc
 * thỉnh thoảng mới làm, còn bảng thì lần nào vào cũng đọc — một biểu mẫu nằm
 * thường trực dưới bảng chỉ đẩy phần đọc thường xuyên ra xa.
 *
 * Biểu mẫu nằm trong `DialogBody` và chỉ được mount khi hộp thoại mở, nên
 * `useActionState` của nó tự về trạng thái ban đầu mỗi lần mở lại — không bị
 * kẹt thông báo "Đã tạo…" của lượt trước. Thành công thì bên gọi đóng hộp và
 * báo bằng `<Toast>`; hàng mới xuất hiện trong bảng nhờ `revalidatePath` ở
 * action.
 */
export function FormDialog({ open, onClose, ...body }: FormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogBody onClose={onClose} {...body} />
    </Dialog>
  )
}

function DialogBody({
  title,
  hint,
  submitLabel,
  pendingLabel = 'Đang lưu…',
  action,
  danger = false,
  onClose,
  onDone,
  children,
}: Omit<FormDialogProps, 'open'>) {
  const [state, formAction, pending] = useActionState(action, idleState)

  useEffect(() => {
    if (state.ok && state.message !== null) onDone(state.message)
  }, [state, onDone])

  return (
    <Box component="form" action={formAction}>
      <DialogTitle>
        {title}
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          {hint}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={4} sx={{ pt: 1 }}>
          {state.message !== null && !state.ok && <Alert severity="error">{state.message}</Alert>}
          {children}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Huỷ
        </Button>
        <Button type="submit" variant="contained" color={danger ? 'error' : 'primary'} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </DialogActions>
    </Box>
  )
}

/** Thông báo ngắn dưới màn hình sau khi một hộp thoại làm xong việc. */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={4000}
      onClose={onClose}
      message={message}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  )
}

/**
 * Trạng thái "hộp nào đang mở + toast" mà mọi menu hàng đều cần. Gom vào một
 * hook để ba menu không chép lại cùng năm dòng `useState`.
 */
export function useDialogState<K extends string>() {
  const [open, setOpen] = useState<K | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // `done` là dependency của một effect trong `DialogBody`; giữ tham chiếu ổn
  // định để effect đó không chạy lại theo mỗi lần vẽ của bên gọi.
  const done = useCallback((message: string) => {
    setOpen(null)
    setToast(message)
  }, [])
  const close = useCallback(() => setOpen(null), [])
  const clearToast = useCallback(() => setToast(null), [])

  return { open, show: setOpen, close, toast, clearToast, done }
}
