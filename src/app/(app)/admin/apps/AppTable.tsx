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
import { buildAppSearchIndex, filterApps } from '@/domain/identity/AppSearch'
import type { FirebaseAppSummary } from '@/domain/identity/entities/FirebaseAppSummary'
import { Pagination, usePagination } from '@/ui/components/Pagination'
import { Scroller } from '@/ui/components/Scroller'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'
import { staleSx } from '@/ui/components/staleSx'
import { FilterSelect, TableToolbar } from '../TableToolbar'
import { AppRowMenu } from './AppForms'

type SortKey = 'name' | 'projectId' | 'credential' | 'status'
type CredentialFilter = 'all' | 'attached' | 'missing'
type StatusFilter = 'all' | 'active' | 'stopped'

const COMPARE: Record<SortKey, (a: FirebaseAppSummary, b: FirebaseAppSummary) => number> = {
  name: (a, b) => compareText(a.displayName, b.displayName),
  projectId: (a, b) => compareText(a.projectId, b.projectId),
  credential: (a, b) => compareBoolean(a.hasCredential, b.hasCredential),
  status: (a, b) => compareBoolean(a.isActive, b.isActive),
}

const CREDENTIAL_OPTIONS = [
  { value: 'all', label: 'Mọi service account' },
  { value: 'attached', label: 'Đã gắn' },
  { value: 'missing', label: 'Chưa gắn' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'stopped', label: 'Đã ngừng' },
] as const

/**
 * Bảng project Firebase: tìm, lọc, sắp xếp và cắt trang đều tại trình duyệt.
 *
 * Trang server đã tải đủ danh sách trong một lượt — danh bạ app có vài chục
 * mục, không phải vài nghìn — nên hỏi lại máy chủ cho mỗi phím gõ chỉ đổi một
 * phép quét chuỗi lấy một vòng mạng. Luật tìm kiếm ở `domain/identity/AppSearch`,
 * phép sắp xếp ở `core/util/sorting`; ở đây chỉ có state và phần vẽ.
 */
export function AppTable({ apps }: { apps: readonly FirebaseAppSummary[] }) {
  const [query, setQuery] = useState('')
  const [credential, setCredential] = useState<CredentialFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'name', direction: 'asc' })
  const deferredQuery = useDeferredValue(query)

  const index = useMemo(() => buildAppSearchIndex(apps), [apps])
  const rows = useMemo(() => {
    const matched = filterApps(apps, index, deferredQuery).filter(
      (app) =>
        (credential === 'all' || app.hasCredential === (credential === 'attached')) &&
        (status === 'all' || app.isActive === (status === 'active')),
    )
    return sortItems(matched, COMPARE[sort.key], sort.direction)
  }, [apps, index, deferredQuery, credential, status, sort])

  const paged = usePagination(rows, { resetKey: `${deferredQuery}|${credential}|${status}` })

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
        placeholder="Tìm theo tên, Project ID, package name"
        searchLabel="Tìm project"
        shown={rows.length}
        total={apps.length}
        unit="project"
        filters={
          <>
            <FilterSelect label="Service account" value={credential} onChange={setCredential} options={CREDENTIAL_OPTIONS} />
            <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </>
        }
      />

      <Scroller>
        {/* Đang lọc cho ký tự vừa gõ: làm mờ nhẹ kết quả cũ thay vì để nó nhấp nháy. */}
        <Table size="small" sx={{ minWidth: 760, ...staleSx(query !== deferredQuery) }}>
          <TableHead>
            <TableRow>
              <TableCell>{header('name', 'Tên')}</TableCell>
              <TableCell>{header('projectId', 'Project ID')}</TableCell>
              <TableCell>Package name</TableCell>
              <TableCell>{header('credential', 'Service account')}</TableCell>
              <TableCell>{header('status', 'Trạng thái')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.items.map((app) => (
              <TableRow key={app.id} hover>
                <TableCell>
                  <Typography variant="body2">{app.displayName}</Typography>
                  <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), fontFamily: MONO_FONT_STACK }}>
                    /{app.slug}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT_STACK, fontSize: 13 }}>{app.projectId}</TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT_STACK, fontSize: 12, color: m3('onSurfaceVariant') }}>
                  {app.packageName ?? '—'}
                </TableCell>
                <TableCell>
                  {app.hasCredential ? (
                    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                      <StatusChip tone="ok" dot>
                        đã gắn
                      </StatusChip>
                      <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), fontFamily: MONO_FONT_STACK }}>
                        {app.credentialClientEmail}
                      </Typography>
                    </Stack>
                  ) : (
                    <StatusChip tone="bad" dot>
                      chưa gắn
                    </StatusChip>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip tone={app.isActive ? 'ok' : 'neutral'} dot>
                    {app.isActive ? 'đang hoạt động' : 'đã ngừng'}
                  </StatusChip>
                </TableCell>
                <TableCell align="right">
                  <AppRowMenu app={app} />
                </TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 3 }}>
                    {apps.length === 0 ? 'Chưa có project nào.' : 'Không có project nào khớp bộ lọc.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Scroller>

      <Pagination {...paged} unit="project" />
    </Stack>
  )
}
