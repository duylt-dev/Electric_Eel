'use client'

import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import KeyIcon from '@mui/icons-material/Key'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useState } from 'react'

import { GLOBAL_ROLE_LABEL, GLOBAL_ROLES } from '@/domain/identity/entities/Permission'
import type { AuthenticatedUser } from '@/domain/identity/entities/Permission'
import { FormDialog, Toast, useDialogState } from '../FormDialog'
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from './actions'

export type UserRow = AuthenticatedUser & { isActive: boolean }

/** Ba ô hồ sơ, dùng chung cho tạo và sửa. */
function ProfileFields({ user, selfRoleLocked }: { user?: UserRow; selfRoleLocked: boolean }) {
  return (
    <>
      <TextField name="name" label="Họ tên" required fullWidth autoFocus defaultValue={user?.name ?? ''} />
      <TextField
        name="email"
        type="email"
        label="Email"
        required
        fullWidth
        defaultValue={user?.email ?? ''}
        helperText={user === undefined ? undefined : 'Đây là tên đăng nhập — đổi xong phải báo cho người đó.'}
      />
      <TextField
        select
        name="role"
        label="Vai trò hệ thống"
        defaultValue={user?.role ?? 'MEMBER'}
        fullWidth
        disabled={selfRoleLocked}
        helperText={
          selfRoleLocked
            ? 'Không tự hạ quyền của chính mình được — nhờ quản trị viên khác.'
            : 'Quản trị hệ thống có toàn quyền trên mọi app và vào được khu vực này.'
        }
      >
        {GLOBAL_ROLES.map((role) => (
          <MenuItem key={role} value={role}>
            {GLOBAL_ROLE_LABEL[role]}
          </MenuItem>
        ))}
      </TextField>
    </>
  )
}

function PasswordFields({ label }: { label: string }) {
  return (
    <>
      <TextField
        name="password"
        type="password"
        label={label}
        required
        fullWidth
        autoComplete="new-password"
        helperText="Ít nhất 8 ký tự, không trùng email hay tên. Người dùng tự đổi lại ở trang Tài khoản."
      />
      <TextField
        name="confirm"
        type="password"
        label="Nhập lại"
        required
        fullWidth
        autoComplete="new-password"
      />
    </>
  )
}

export function CreateUserDialog() {
  const dialog = useDialogState<'create'>()

  return (
    <>
      <Tooltip title="Thêm tài khoản">
        <IconButton onClick={() => dialog.show('create')} aria-label="Thêm tài khoản">
          <AddIcon />
        </IconButton>
      </Tooltip>

      <FormDialog
        open={dialog.open === 'create'}
        onClose={dialog.close}
        title="Thêm tài khoản"
        hint="Tài khoản nội bộ. Người dùng đổi mật khẩu sau khi đăng nhập lần đầu."
        submitLabel="Tạo tài khoản"
        pendingLabel="Đang tạo…"
        action={createUserAction}
        onDone={dialog.done}
      >
        <ProfileFields selfRoleLocked={false} />
        <TextField
          name="password"
          type="password"
          label="Mật khẩu tạm"
          required
          fullWidth
          autoComplete="new-password"
          helperText="Ít nhất 8 ký tự. Đọc cho người dùng rồi nhắc họ tự đổi."
        />
      </FormDialog>

      <Toast message={dialog.toast} onClose={dialog.clearToast} />
    </>
  )
}

type UserDialog = 'edit' | 'password' | 'toggle' | 'delete'

/**
 * Menu ba chấm ở cuối mỗi hàng tài khoản.
 *
 * `isSelf` khoá ba việc tự làm với mình (khoá, xoá, hạ quyền) ngay trên menu;
 * server action vẫn tự chặn lại, nút mờ chỉ là lời báo trước.
 */
export function UserRowMenu({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const dialog = useDialogState<UserDialog>()

  const openDialog = (key: UserDialog) => {
    setAnchor(null)
    dialog.show(key)
  }

  return (
    <>
      <Tooltip title="Thao tác">
        <IconButton
          size="small"
          aria-label={`Thao tác với ${user.name}`}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => openDialog('edit')}>
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Sửa hồ sơ
        </MenuItem>
        <MenuItem onClick={() => openDialog('password')}>
          <ListItemIcon>
            <KeyIcon fontSize="small" />
          </ListItemIcon>
          Đặt lại mật khẩu
        </MenuItem>
        <MenuItem onClick={() => openDialog('toggle')} disabled={isSelf}>
          <ListItemIcon>
            {user.isActive ? <BlockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
          </ListItemIcon>
          {user.isActive ? 'Khoá tài khoản' : 'Mở lại tài khoản'}
        </MenuItem>
        <MenuItem onClick={() => openDialog('delete')} disabled={isSelf} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Xoá tài khoản
        </MenuItem>
      </Menu>

      <FormDialog
        open={dialog.open === 'edit'}
        onClose={dialog.close}
        title={`Sửa ${user.name}`}
        hint="Đổi vai trò có hiệu lực ngay ở request kế tiếp, không cần đăng nhập lại."
        submitLabel="Lưu"
        action={updateUserAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="userId" value={user.id} />
        <ProfileFields user={user} selfRoleLocked={isSelf} />
        {isSelf && <input type="hidden" name="role" value={user.role} />}
      </FormDialog>

      <FormDialog
        open={dialog.open === 'password'}
        onClose={dialog.close}
        title={`Đặt lại mật khẩu cho ${user.name}`}
        hint="Dùng khi người dùng quên mật khẩu — không có kênh email để họ tự đặt lại."
        submitLabel="Đặt mật khẩu"
        action={resetPasswordAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="userId" value={user.id} />
        <PasswordFields label="Mật khẩu tạm mới" />
      </FormDialog>

      <FormDialog
        open={dialog.open === 'toggle'}
        onClose={dialog.close}
        title={user.isActive ? `Khoá ${user.name}?` : `Mở lại ${user.name}?`}
        hint={
          user.isActive
            ? 'Người này mất quyền trên mọi app ngay lập tức, kể cả phiên đang mở. Mở lại được bất cứ lúc nào.'
            : 'Người này đăng nhập lại được với mật khẩu cũ và giữ nguyên phân quyền trước đó.'
        }
        submitLabel={user.isActive ? 'Khoá' : 'Mở lại'}
        danger={user.isActive}
        action={setUserActiveAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="isActive" value={user.isActive ? 'false' : 'true'} />
      </FormDialog>

      <FormDialog
        open={dialog.open === 'delete'}
        onClose={dialog.close}
        title={`Xoá ${user.name}?`}
        hint="Mất luôn phân quyền trên mọi app. Nhật ký thao tác cũ vẫn giữ, chỉ không còn tên. Không hoàn tác được — cân nhắc khoá thay vì xoá."
        submitLabel="Xoá vĩnh viễn"
        pendingLabel="Đang xoá…"
        danger
        action={deleteUserAction}
        onDone={dialog.done}
      >
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="email" value={user.email} />
        <TextField
          name="confirm"
          label="Gõ lại email để xác nhận"
          required
          fullWidth
          autoFocus
          autoComplete="off"
          placeholder={user.email}
          helperText={`Gõ đúng "${user.email}" thì nút xoá mới có hiệu lực.`}
        />
      </FormDialog>

      <Toast message={dialog.toast} onClose={dialog.clearToast} />
    </>
  )
}
