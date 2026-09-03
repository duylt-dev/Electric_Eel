'use client'

import MuiPagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo, useState } from 'react'

import { PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from '@/core/util/paging'

import { m3 } from '../theme/m3Tokens'

/**
 * Phân trang cho một danh sách đã nằm sẵn trong bộ nhớ.
 *
 * Hai nửa dùng chung: `usePagination` giữ số trang, `Pagination` vẽ hàng nút.
 * Tách ra vì bên gọi cần cắt danh sách trước khi vẽ (lưới thẻ, thân bảng) rồi
 * mới vẽ nút ở cuối — một component bọc cả danh sách sẽ buộc mọi chỗ dùng phải
 * vẽ giống nhau, mà chúng không giống nhau.
 *
 * Phép tính nằm ở `core/util/paging.ts` để test được không cần React; ở đây
 * chỉ còn state của React và phần vẽ.
 *
 *     const paged = usePagination(rows, { resetKey: query })
 *     …
 *     {paged.items.map(…)}
 *     <Pagination {...paged} unit="app" />
 */

export interface PaginationOptions {
  /** Mặc định `PAGE_SIZE` (25). Chỉ truyền khi danh sách này thật sự cần khác. */
  pageSize?: number
  /**
   * Đổi giá trị này thì quay về trang 1.
   *
   * Dùng cho thứ làm danh sách thành một danh sách khác hẳn: ô tìm kiếm, bộ
   * lọc, đổi thiết bị. Đứng nguyên ở trang 5 sau khi gõ tìm kiếm là cách nhanh
   * nhất để người dùng kết luận "không có kết quả nào".
   *
   * So sánh bằng `Object.is`, nên hãy truyền chuỗi hoặc số — đừng truyền một
   * object dựng lại mỗi lần vẽ.
   */
  resetKey?: unknown
}

export interface Paged<T> {
  /** Phần danh sách thuộc trang đang xem. */
  readonly items: T[]
  /** Trang đang xem, đếm từ 1 và luôn nằm trong khoảng hợp lệ. */
  readonly page: number
  readonly pageCount: number
  /** Thứ tự mục đầu trang, đếm từ 1. Danh sách rỗng cho 0. */
  readonly from: number
  readonly to: number
  readonly total: number
  readonly pageSize: number
  readonly setPage: (page: number) => void
}

export function usePagination<T>(items: readonly T[], options: PaginationOptions = {}): Paged<T> {
  const { pageSize = PAGE_SIZE, resetKey } = options

  const [requested, setRequested] = useState(1)
  const [seenKey, setSeenKey] = useState(resetKey)

  // Chỉnh state ngay trong lượt vẽ thay vì trong một effect: làm ở effect thì
  // có đúng một khung hình vẽ ra trang 5 của danh sách vừa đổi, rồi mới nhảy
  // về trang 1 — người dùng thấy nội dung nháy một cái.
  const reset = !Object.is(resetKey, seenKey)
  if (reset) {
    setSeenKey(resetKey)
    setRequested(1)
  }

  const count = pageCount(items.length, pageSize)
  // Kéo về khoảng hợp lệ mỗi lượt vẽ, không ghi ngược vào state: danh sách co
  // lại rồi giãn ra (gõ rồi xoá ô tìm kiếm) thì người dùng về đúng trang cũ.
  const page = clampPage(reset ? 1 : requested, count)

  const visible = useMemo(() => pageSlice(items, page, pageSize), [items, page, pageSize])
  const range = pageRange(page, items.length, pageSize)

  return {
    items: visible,
    page,
    pageCount: count,
    from: range.from,
    to: range.to,
    total: range.total,
    pageSize,
    setPage: setRequested,
  }
}

export interface PaginationProps {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  setPage: (page: number) => void
  /** Danh từ đếm được trong câu tóm tắt: "app", "dòng", "người dùng". */
  unit?: string
  sx?: SxProps<Theme>
}

/**
 * Hàng nút chuyển trang, kèm câu "26–50 trên 132 app".
 *
 * Một trang thì không vẽ gì: hàng nút chỉ có đúng một nút bấm không được là
 * thứ vô nghĩa, còn tổng số mục thì mọi màn đã nói ở đầu danh sách rồi.
 *
 * Hàng nút luôn nằm gọn trên **một** dòng, ở mọi bề rộng. Vỡ dòng thành hai
 * hàng số thì mắt không còn đọc được đó là một dải trang liên tục — chỗ nào
 * chật thì rút bớt số bằng dấu `…`, chứ không xuống dòng. Vì vậy:
 *
 * - `siblingCount={0}`: quanh trang đang xem không kèm số hàng xóm, nên số nút
 *   đứng yên ở tối đa bảy ô (`‹ 1 … 4 … 7 ›`) dù danh sách có bao nhiêu trang.
 *   Nhảy xa vẫn còn nút đầu/cuối, nhảy gần đã có mũi tên.
 * - `flexWrap: 'nowrap'` cho dải số, `flexShrink: 0` cho cả cụm.
 *
 * Thứ được phép xuống dòng là câu tóm tắt bên trái: nó chỉ để tham khảo, và
 * cột hẹp (danh sách vị trí quảng cáo đứng cạnh biểu mẫu) thì không đủ chỗ cho
 * cả hai trên cùng một dòng.
 */
export function Pagination({ page, pageCount, from, to, total, setPage, unit, sx }: PaginationProps) {
  if (pageCount <= 1) return null

  const counted = unit === undefined ? `${total}` : `${total} ${unit}`

  return (
    <Stack
      direction="row"
      sx={[
        {
          gap: 3,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
        {from}–{to} trên {counted}
      </Typography>

      <MuiPagination
        page={page}
        count={pageCount}
        onChange={(_event, next) => setPage(next)}
        shape="rounded"
        color="primary"
        size="small"
        siblingCount={0}
        boundaryCount={1}
        sx={{ flexShrink: 0, '& .MuiPagination-ul': { flexWrap: 'nowrap' } }}
        getItemAriaLabel={(type, itemPage, selected) => {
          if (type === 'previous') return 'Trang trước'
          if (type === 'next') return 'Trang sau'
          if (type === 'first') return 'Trang đầu'
          if (type === 'last') return 'Trang cuối'
          return selected ? `Trang ${itemPage}, đang xem` : `Tới trang ${itemPage}`
        }}
      />
    </Stack>
  )
}
