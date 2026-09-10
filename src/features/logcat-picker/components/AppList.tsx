'use client'

import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useDeferredValue, useMemo, useState } from 'react'

import { buildPackageList, filterPackages } from '@/domain/adb/entities/AndroidPackage'
import type { AndroidPackage } from '@/domain/adb/entities/AndroidPackage'
import { Pagination, usePagination } from '@/ui/components/Pagination'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Danh sách app trên máy, kèm ô tìm kiếm.
 *
 * Lọc ngay tại trình duyệt vì cùng lý do như màn chọn app của Remote Config:
 * toàn bộ danh sách đã nằm sẵn ở lần vẽ đầu, nên một vòng mạng cho mỗi phím gõ
 * chỉ làm ô tìm kiếm giật. `useDeferredValue` thay cho debounce để ô nhập vẽ
 * ngay ký tự vừa gõ còn phần lọc chạy ở lượt sau — không có bộ đếm giờ nào
 * phải dọn, và một máy chỉ cài mười app không phải chờ oan.
 *
 * Trạng thái ô tìm kiếm là state cục bộ chứ không nằm trong ViewModel: nó là
 * trạng thái thuần giao diện, không ai cần nó để quyết định việc gì. Số trang
 * cũng vậy — nó nằm trong `usePagination`, dùng chung với mọi danh sách khác.
 */
export interface AppListProps {
  /** applicationId đọc từ máy, chưa có nhãn. */
  packageNames: readonly string[]
  /** applicationId → tên hiển thị, lấy từ danh bạ app của tool. */
  labels: ReadonlyMap<string, string>
  /** App trong danh bạ chưa ai điền applicationId. Hiện ra nhưng không mở được. */
  unlinked: readonly { slug: string; displayName: string }[]
  onOpen: (packageName: string | null, label: string) => void
}

export function AppList({ packageNames, labels, unlinked, onOpen }: AppListProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const packages = useMemo(() => buildPackageList(packageNames, labels), [packageNames, labels])
  const results = useMemo(() => filterPackages(packages, deferredQuery), [packages, deferredQuery])

  const needle = deferredQuery.trim().toLowerCase()
  const unlinkedResults = useMemo(
    () =>
      needle.length === 0
        ? unlinked
        : unlinked.filter((app) => app.displayName.toLowerCase().includes(needle)),
    [unlinked, needle],
  )

  const searching = needle.length > 0
  const stale = query !== deferredQuery

  // Hai nhóm thẻ đi chung một dòng chảy để mỗi trang luôn đủ 25 thẻ. App chưa
  // có applicationId xếp cuối: chúng không có package name để mà xếp vào bảng
  // chữ cái, và chúng là ngoại lệ chứ không phải thứ người ta tới đây để tìm.
  const rows = useMemo<AppRow[]>(
    () => [
      ...results.map((item) => ({ key: `pkg:${item.packageName}`, item }) as const),
      ...unlinkedResults.map((app) => ({ key: `app:${app.slug}`, displayName: app.displayName }) as const),
    ],
    [results, unlinkedResults],
  )

  // Đổi ô tìm kiếm là đổi sang một danh sách khác, nên quay về trang 1.
  const paged = usePagination(rows, { resetKey: needle })

  return (
    <Stack spacing={5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 3, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <TextField
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
          }}
          placeholder="Tìm theo tên app hoặc package name"
          sx={{
            width: '100%',
            maxWidth: 460,
            'input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Tìm app trên máy' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment:
                query.length === 0 ? null : (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Xoá ô tìm kiếm" onClick={() => setQuery('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
            },
          }}
        />

        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), flexShrink: 0 }}>
          {searching
            ? `${paged.total} / ${packages.length} app khớp`
            : `${packages.length} app trên máy`}
        </Typography>
      </Stack>

      {paged.total === 0 ? (
        <NoMatch query={deferredQuery.trim()} onClear={() => setQuery('')} />
      ) : (
        <Stack spacing={4}>
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              opacity: stale ? 0.6 : 1,
              transition: 'opacity 120ms ease',
            }}
          >
            {paged.items.map((row) =>
              'item' in row ? (
                <AppCard key={row.key} item={row.item} onOpen={onOpen} />
              ) : (
                <UnlinkedCard key={row.key} displayName={row.displayName} onOpen={onOpen} />
              ),
            )}
          </Box>

          <Pagination {...paged} unit="app" />
        </Stack>
      )}
    </Stack>
  )
}

/** Một ô trong lưới: hoặc app đọc từ máy, hoặc app trong danh bạ chưa có applicationId. */
type AppRow =
  | { readonly key: string; readonly item: AndroidPackage }
  | { readonly key: string; readonly displayName: string }

const cardSx = {
  width: '100%',
  p: 4,
  justifyContent: 'flex-start',
  textAlign: 'left',
  borderRadius: `${m3Shape.large}px`,
  border: `1px solid ${m3('outlineVariant')}`,
  backgroundColor: m3('surfaceContainerLow'),
} as const

function AppCard({
  item,
  onOpen,
}: {
  item: AndroidPackage
  onOpen: (packageName: string | null, label: string) => void
}) {
  // App ngoài danh bạ không có nhãn, và trước đây thẻ in package name hai lần —
  // một lần làm tiêu đề, một lần làm dòng phụ. Không có nhãn thì package name
  // LÀ tên của app: in một dòng, giữ nguyên phông mono để vẫn đọc ra đó là
  // applicationId chứ không phải tên đội đặt.
  const label = item.label ?? item.packageName

  return (
    <ButtonBase onClick={() => onOpen(item.packageName, label)} sx={cardSx}>
      <Box sx={{ minWidth: 0, width: '100%' }}>
        <Typography
          variant="subtitle1"
          noWrap
          sx={{ display: 'block', fontFamily: item.label === null ? MONO_FONT_STACK : undefined }}
        >
          {label}
        </Typography>
        {item.label !== null && (
          <Typography
            variant="caption"
            noWrap
            sx={{ display: 'block', fontFamily: MONO_FONT_STACK, color: m3('onSurfaceVariant') }}
          >
            {item.packageName}
          </Typography>
        )}
        {item.known && (
          <Box sx={{ mt: 2 }}>
            <StatusChip tone="info">trong danh bạ</StatusChip>
          </Box>
        )}
      </Box>
    </ButtonBase>
  )
}

/**
 * App của đội nhưng chưa ai điền applicationId.
 *
 * Vẫn bấm được — bấm vào thì được nói rõ phải đi điền ở đâu. Một thẻ bấm không
 * được và không giải thích gì chỉ khiến người ta bấm thêm vài lần rồi bỏ.
 */
function UnlinkedCard({
  displayName,
  onOpen,
}: {
  displayName: string
  onOpen: (packageName: string | null, label: string) => void
}) {
  return (
    <ButtonBase
      onClick={() => onOpen(null, displayName)}
      sx={{ ...cardSx, borderStyle: 'dashed', backgroundColor: 'transparent' }}
    >
      <Box sx={{ minWidth: 0, width: '100%' }}>
        <Typography variant="subtitle1" noWrap sx={{ color: m3('onSurfaceVariant') }}>
          {displayName}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: m3('outline') }}>
          chưa có package name
        </Typography>
        <Box sx={{ mt: 2 }}>
          <StatusChip tone="warn">không lọc log được</StatusChip>
        </Box>
      </Box>
    </ButtonBase>
  )
}

function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <Stack spacing={3} sx={{ alignItems: 'center', py: 12, textAlign: 'center' }}>
      <SearchOffIcon sx={{ fontSize: 40, color: m3('outline') }} />
      <Box>
        <Typography variant="subtitle1">
          {query.length === 0 ? 'Máy này chưa có app nào cài thêm' : `Không app nào khớp “${query}”`}
        </Typography>
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 1, maxWidth: '52ch' }}>
          Danh sách chỉ gồm app cài thêm — app hệ thống trong ROM không bao giờ hiện ở đây.
        </Typography>
      </Box>
      {query.length > 0 && (
        <Typography
          component="button"
          onClick={onClear}
          sx={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: m3('primary'),
            font: 'inherit',
          }}
        >
          Xoá ô tìm kiếm
        </Typography>
      )}
    </Stack>
  )
}
