'use client'

import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import { useDeferredValue, useMemo, useState } from 'react'

import { compareBoolean, compareText, sortItems, toggleSort } from '@/core/util/sorting'
import type { SortState } from '@/core/util/sorting'
import { GLOBAL_ROLE_LABEL } from '@/domain/identity/entities/Permission'
import type { GlobalRole } from '@/domain/identity/entities/Permission'
import { buildUserSearchIndex, filterUsers } from '@/domain/identity/UserSearch'
import { Pagination, usePagination } from '@/ui/components/Pagination'
import { Scroller } from '@/ui/components/Scroller'
import { StatusChip } from '@/ui/components/StatusChip'
import { m3 } from '@/ui/theme/m3Tokens'
import { staleSx } from '@/ui/components/staleSx'
import { FilterSelect, TableToolbar } from '../TableToolbar'
import { UserRowMenu } from './UserForms'
import type { UserRow } from './UserForms'

export type { UserRow } from './UserForms'

type SortKey = 'name' | 'email' | 'role' | 'status'
type RoleFilter = 'all' | GlobalRole
type StatusFilter = 'all' | 'active' | 'locked'

const COMPARE: Record<SortKey, (a: UserRow, b: UserRow) => number> = {
  name: (a, b) => compareText(a.name, b.name),
  email: (a, b) => compareText(a.email, b.email),
  // ADMIN trước MEMBER khi tăng dần: quản trị viên là số ít, để họ lên đầu.
  role: (a, b) => compareBoolean(a.role !== 'ADMIN', b.role !== 'ADMIN'),
  status: (a, b) => compareBoolean(!a.isActive, !b.isActive),
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'Mọi vai trò' },
  { value: 'ADMIN', label: GLOBAL_ROLE_LABEL.ADMIN },
  { value: 'MEMBER', label: GLOBAL_ROLE_LABEL.MEMBER },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'locked', label: 'Đã khoá' },
] as const

/**
 * Bảng tài khoản — cùng cách với `AppTable`: mọi thứ tại trình duyệt.
 *
 * `currentUserId` để menu khoá ba việc tự làm với mình; server action vẫn tự
 * chặn lại, nút mờ chỉ là lời báo trước.
 */
export function UserTable({ users, currentUserId }: { users: readonly UserRow[]; currentUserId: string }) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'name', direction: 'asc' })
  const deferredQuery = useDeferredValue(query)

  const index = useMemo(() => buildUserSearchIndex(users), [users])
  const rows = useMemo(() => {
    const matched = filterUsers(users, index, deferredQuery).filter(
      (user) =>
        (role === 'all' || user.role === role) &&
        (status === 'all' || user.isActive === (status === 'active')),
    )
    return sortItems(matched, COMPARE[sort.key], sort.direction)
  }, [users, index, deferredQuery, role, status, sort])

  const paged = usePagination(rows, { resetKey: `${deferredQuery}|${role}|${status}` })

  const header = (key: SortKey, label: string) => (
    <TableSortLabel
      active={sort.key === key}
      direction={sort.key === key ? sort.direction : 'asc'}
      onClick={() => setSort((current) => toggleSort(current, key))}
    >
      {label}
    </TableSortLabel>
  )

  return (
    <Stack spacing={4}>
      <TableToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Tìm theo họ tên hoặc email"
        searchLabel="Tìm tài khoản"
        shown={rows.length}
        total={users.length}
        unit="tài khoản"
        filters={
          <>
            <FilterSelect label="Vai trò" value={role} onChange={setRole} options={ROLE_OPTIONS} />
            <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </>
        }
      />

      <Scroller>
        <Table size="small" sx={{ minWidth: 720, ...staleSx(query !== deferredQuery) }}>
          <TableHead>
            <TableRow>
              <TableCell>{header('name', 'Họ tên')}</TableCell>
              <TableCell>{header('email', 'Email')}</TableCell>
              <TableCell>{header('role', 'Vai trò hệ thống')}</TableCell>
              <TableCell>{header('status', 'Trạng thái')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.items.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Typography variant="body2">{user.name}</Typography>
                  {user.id === currentUserId && (
                    <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
                      bạn
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ color: m3('onSurfaceVariant') }}>{user.email}</TableCell>
                <TableCell>{GLOBAL_ROLE_LABEL[user.role]}</TableCell>
                <TableCell>
                  <StatusChip tone={user.isActive ? 'ok' : 'neutral'} dot>
                    {user.isActive ? 'đang hoạt động' : 'đã khoá'}
                  </StatusChip>
                </TableCell>
                <TableCell align="right">
                  <UserRowMenu user={user} isSelf={user.id === currentUserId} />
                </TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 3 }}>
                    Không có tài khoản nào khớp bộ lọc.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Scroller>

      <Pagination {...paged} unit="tài khoản" />
    </Stack>
  )
}
