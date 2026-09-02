'use client'

import LogoutIcon from '@mui/icons-material/Logout'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import NextLink from 'next/link'
import { useState } from 'react'

import { m3 } from '../theme/m3Tokens'

export interface UserMenuProps {
  name: string
  email: string
  roleLabel: string
  onSignOut: () => void
}

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

export function UserMenu({ name, email, roleLabel, onSignOut }: UserMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <>
      <Tooltip title={name}>
        <IconButton onClick={(event) => setAnchor(event.currentTarget)} size="small" aria-label="Tài khoản">
          <Avatar
            sx={{
              width: 32,
              height: 32,
              fontSize: 13,
              fontWeight: 600,
              bgcolor: m3('primaryContainer'),
              color: m3('onPrimaryContainer'),
            }}
          >
            {initials(name)}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, bgcolor: m3('surfaceContainerHigh') } } }}
      >
        <Box sx={{ px: 4, py: 3 }}>
          <Typography variant="subtitle2">{name}</Typography>
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), display: 'block' }}>
            {email}
          </Typography>
          <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
            {roleLabel}
          </Typography>
        </Box>
        <Divider />
        {/* Component này là client component, nên truyền thẳng `NextLink` vào
            `component` được — cái bẫy ở `LLM.md` §10 chỉ xảy ra khi làm vậy
            từ một Server Component. */}
        <MenuItem component={NextLink} href="/account" onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <ManageAccountsIcon fontSize="small" />
          </ListItemIcon>
          Tài khoản và mật khẩu
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null)
            onSignOut()
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Đăng xuất
        </MenuItem>
      </Menu>
    </>
  )
}
