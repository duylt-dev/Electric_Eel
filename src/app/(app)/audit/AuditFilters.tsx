'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { ReactNode } from 'react'

import { pageCount, pageRange } from '@/core/util/paging'
import { DEFAULT_AUDIT_QUERY, auditQueryToSearchParams } from '@/domain/identity/AuditQuery'
import type { AuditQuery, AuditStatusFilter } from '@/domain/identity/AuditQuery'
import { Pagination } from '@/ui/components/Pagination'
import { staleSx } from '@/ui/components/staleSx'
import { m3 } from '@/ui/theme/m3Tokens'

const STATUS_OPTIONS: readonly { value: AuditStatusFilter; label: string }[] = [
  { value: 'all', label: 'Mọi kết quả' },
  { value: 'succeeded', label: 'Thành công' },
  { value: 'failed', label: 'Thất bại' },
]

/**
 * Bộ lọc và hàng nút trang của Nhật ký. Cả hai chỉ làm một việc: đổi URL.
 *
 * Trang là Server Component, đọc `searchParams` và hỏi DB; component này
 * không giữ dữ liệu, chỉ giữ ý muốn của người dùng trên URL (xem
 * `domain/identity/AuditQuery`). `router.replace` chứ không `push` cho bộ lọc
 * — mười lần đổi ngày không nên thành mười mục trong lịch sử Back; còn chuyển
 * trang thì `push`, vì "về trang trước" là điều người ta mong ở nút Back.
 *
 * `useTransition` để bảng cũ mờ đi trong lúc chờ máy chủ thay vì đứng im
 * không phản hồi — luật "không được chờ" ở LLM.md §8.
 */
export function useAuditNavigation(query: AuditQuery) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const navigate = (next: AuditQuery, mode: 'replace' | 'push') => {
    const params = auditQueryToSearchParams(next).toString()
    const href = params.length === 0 ? pathname : `${pathname}?${params}`
    startTransition(() => {
      if (mode === 'replace') router.replace(href)
      else router.push(href)
    })
  }

  return {
    pending,
    /** Đổi bộ lọc thì về trang 1: đứng ở trang 5 của một danh sách mới là cách nhanh nhất để thấy "không có gì". */
    setFilter: (patch: Partial<Omit<AuditQuery, 'page'>>) => navigate({ ...query, ...patch, page: 1 }, 'replace'),
    setPage: (page: number) => navigate({ ...query, page }, 'push'),
    reset: () => navigate(DEFAULT_AUDIT_QUERY, 'replace'),
  }
}

export function AuditFilters({
  query,
  total,
  nav,
}: {
  query: AuditQuery
  total: number
  nav: ReturnType<typeof useAuditNavigation>
}) {
  const filtering = query.from !== null || query.to !== null || query.status !== 'all'

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 3, alignItems: { md: 'center' } }}>
      <TextField
        type="date"
        size="small"
        label="Từ ngày"
        value={query.from ?? ''}
        onChange={(event) => nav.setFilter({ from: event.target.value || null })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: query.to ?? undefined } }}
        sx={{ minWidth: 170 }}
      />
      <TextField
        type="date"
        size="small"
        label="Đến ngày"
        value={query.to ?? ''}
        onChange={(event) => nav.setFilter({ to: event.target.value || null })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: query.from ?? undefined } }}
        sx={{ minWidth: 170 }}
      />
      <TextField
        select
        size="small"
        label="Kết quả"
        value={query.status}
        onChange={(event) => nav.setFilter({ status: event.target.value as AuditStatusFilter })}
        sx={{ minWidth: 170 }}
      >
        {STATUS_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {filtering && (
        <Button size="small" onClick={nav.reset}>
          Bỏ lọc
        </Button>
      )}

      <Typography
        variant="caption"
        sx={{ color: m3('onSurfaceVariant'), flexShrink: 0, ml: { md: 'auto' }, fontVariantNumeric: 'tabular-nums' }}
      >
        {filtering ? `${total} bản ghi khớp` : `${total} bản ghi`}
      </Typography>
    </Stack>
  )
}

/**
 * Bọc bảng (vẽ ở server) giữa bộ lọc và hàng nút trang, cùng chia sẻ một
 * `useTransition` để làm mờ bảng trong lúc điều hướng.
 */
export function AuditShell({
  query,
  total,
  page,
  pageSize,
  children,
}: {
  query: AuditQuery
  total: number
  /** Trang thật sự đang hiện — kho đã kéo `query.page` về khoảng hợp lệ. */
  page: number
  pageSize: number
  children: ReactNode
}) {
  const nav = useAuditNavigation({ ...query, page })
  const range = pageRange(page, total, pageSize)

  return (
    <Stack spacing={4}>
      <AuditFilters query={query} total={total} nav={nav} />
      <Box sx={staleSx(nav.pending)}>{children}</Box>
      <Pagination
        page={page}
        pageCount={pageCount(total, pageSize)}
        from={range.from}
        to={range.to}
        total={range.total}
        setPage={nav.setPage}
        unit="bản ghi"
      />
    </Stack>
  )
}
