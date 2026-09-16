'use client'

import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import TuneIcon from '@mui/icons-material/Tune'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { FirebaseAppSummary } from '@/domain/identity/entities/FirebaseAppSummary'
import { createAppAction, deleteAppAction, updateAppAction } from '../actions'
import { FormDialog, Toast, useDialogState } from '../FormDialog'

/** Ba ô mô tả app, dùng chung cho tạo và sửa. `app` rỗng là biểu mẫu tạo mới. */
function AppFields({ app }: { app?: FirebaseAppSummary }) {
  return (
    <>
      <TextField
        name="displayName"
        label="Tên hiển thị"
        required
        fullWidth
        autoFocus
        defaultValue={app?.displayName ?? ''}
        helperText="Tên đội ngũ dùng để gọi app này."
      />
      <TextField
        name="projectId"
        label="Firebase Project ID"
        required
        fullWidth
        defaultValue={app?.projectId ?? ''}
        helperText={
          app?.hasCredential
            ? 'Đổi Project ID thì service account đang gắn không còn khớp — phải thay nó trước khi publish.'
            : 'Lấy trong Firebase Console › Project settings. Không phải tên project.'
        }
      />
      <TextField
        name="packageName"
        label="Package name"
        fullWidth
        defaultValue={app?.packageName ?? ''}
        placeholder="com.pion.lovetest"
        helperText="Bỏ trống cũng được. Chưa điền thì tìm app bằng package name sẽ không ra."
      />
    </>
  )
}

export function CreateAppDialog() {
  const dialog = useDialogState<'create'>()

  return (
    <>
      <Tooltip title="Thêm project Firebase">
        <IconButton onClick={() => dialog.show('create')} aria-label="Thêm project Firebase">
          <AddIcon />
        </IconButton>
      </Tooltip>

      <FormDialog
        open={dialog.open === 'create'}
        onClose={dialog.close}
        title="Thêm project Firebase"
        hint="Tạo bản ghi trước, gắn service account sau."
        submitLabel="Tạo app"
        pendingLabel="Đang tạo…"
        action={createAppAction}
        onDone={dialog.done}
      >
        <AppFields />
        <TextField
          name="slug"
          label="Định danh trên URL"
          required
          fullWidth
          helperText="Chữ thường, số và gạch ngang. Ví dụ: love-test. Tạo xong thì không đổi được."
        />
      </FormDialog>

      <Toast message={dialog.toast} onClose={dialog.clearToast} />
    </>
  )
}

/**
 * Menu ba chấm ở cuối mỗi hàng: cấu hình (trang riêng), sửa, xoá.
 *
 * Xoá bắt gõ lại slug: nút "Xoá" rồi "Đồng ý" là hai cú bấm theo quán tính,
 * còn gõ lại tên thì phải đọc nó — và app xoá đi là mất cả phân quyền lẫn
 * service account, không có thùng rác.
 */
export function AppRowMenu({ app }: { app: FirebaseAppSummary }) {
  const router = useRouter()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const dialog = useDialogState<'edit' | 'delete'>()

  const openDialog = (key: 'edit' | 'delete') => {
    setAnchor(null)
    dialog.show(key)
  }

  return (
    <>
      <Tooltip title="Thao tác">
        <IconButton
          size="small"
          aria-label={`Thao tác với ${app.displayName}`}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null)
            router.push(`/admin/apps/${app.slug}`)
          }}
        >
          <ListItemIcon>
            <TuneIcon fontSize="small" />
          </ListItemIcon>
          Service account &amp; phân quyền
        </MenuItem>
        <MenuItem onClick={() => openDialog('edit')}>
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Sửa thông tin
        </MenuItem>
        <MenuItem onClick={() => openDialog('delete')} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Xoá app
        </MenuItem>
      </Menu>

      <FormDialog
        open={dialog.open === 'edit'}
        onClose={dialog.close}
        title={`Sửa ${app.displayName}`}
        hint={`Định danh /${app.slug} giữ nguyên — nó nằm trong URL và nhật ký của mọi người.`}
        submitLabel="Lưu"
        action={updateAppAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="slug" value={app.slug} />
        <AppFields app={app} />
        <div>
          <FormControlLabel
            control={<Switch name="isActive" defaultChecked={app.isActive} />}
            label="Đang hoạt động"
          />
          <FormHelperText>
            Tắt thì app hiện nhãn “đã ngừng” ở màn chọn app; ai có quyền vẫn mở được.
          </FormHelperText>
        </div>
      </FormDialog>

      <FormDialog
        open={dialog.open === 'delete'}
        onClose={dialog.close}
        title={`Xoá ${app.displayName}?`}
        hint="Mất luôn phân quyền và service account của app này. Nhật ký thao tác cũ vẫn giữ. Không hoàn tác được."
        submitLabel="Xoá vĩnh viễn"
        pendingLabel="Đang xoá…"
        danger
        action={deleteAppAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="slug" value={app.slug} />
        <TextField
          name="confirm"
          label="Gõ lại định danh để xác nhận"
          required
          fullWidth
          autoFocus
          autoComplete="off"
          placeholder={app.slug}
          helperText={`Gõ đúng "${app.slug}" thì nút xoá mới có hiệu lực.`}
        />
      </FormDialog>

      <Toast message={dialog.toast} onClose={dialog.clearToast} />
    </>
  )
}
