'use client'

import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useDeferredValue, useMemo, useState } from 'react'

import { buildAppSearchIndex, filterApps } from '@/domain/identity/AppSearch'
import type { FirebaseAppSummary } from '@/domain/identity/entities/FirebaseAppSummary'
import { APP_ROLE_LABEL } from '@/domain/identity/entities/Permission'
import { LinkCardAction } from '@/ui/components/NavLink'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'

/**
 * Danh sách app kèm ô tìm kiếm.
 *
 * ─── Vì sao lọc ở trình duyệt chứ không hỏi lại server ───
 *
 * Danh sách app một người thấy được là danh sách đã lọc theo quyền, và nó
 * không dài. Gửi một request cho mỗi phím gõ chỉ đổi một phép quét chuỗi vài
 * micro giây lấy một vòng mạng vài chục mili giây — chậm hơn, và ô tìm kiếm sẽ
 * giật mỗi khi mạng chậm. Toàn bộ dữ liệu đã nằm sẵn ở lần vẽ đầu.
 *
 * ─── Vì sao là `useDeferredValue` chứ không phải debounce ───
 *
 * Debounce bằng `setTimeout` áp một độ trễ cố định lên MỌI lần gõ, kể cả khi
 * danh sách chỉ có ba app và lọc xong trong nháy mắt. `useDeferredValue` vẽ ô
 * nhập ngay với ký tự vừa gõ, rồi mới lọc lại ở lượt sau và bỏ luôn các lượt
 * đã cũ khi người dùng gõ tiếp. Không có bộ đếm giờ nào phải dọn khi component
 * biến mất, và không có độ trễ nào bị áp oan.
 *
 * ─── Trạng thái tìm kiếm là state cục bộ, không phải ViewModel ───
 *
 * Đúng như `docs/architecture.md` §2 cho phép: ô tìm kiếm tạm là trạng thái
 * thuần giao diện. Còn LUẬT tìm kiếm — trường nào tính là định danh của app,
 * bỏ dấu ra sao — nằm trong `domain/identity/AppSearch.ts` để kiểm thử được mà
 * không cần vẽ gì.
 */
export function AppPicker({ apps }: { apps: readonly FirebaseAppSummary[] }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // Chỉ mục dựng đúng một lần cho mỗi danh sách. `apps` đến từ Server Component
  // nên tham chiếu của nó không đổi giữa các lần gõ.
  const index = useMemo(() => buildAppSearchIndex(apps), [apps])
  const results = useMemo(() => filterApps(apps, index, deferredQuery), [apps, index, deferredQuery])

  const searching = deferredQuery.trim().length > 0
  // Đang lọc cho ký tự vừa gõ: làm mờ nhẹ kết quả cũ thay vì để nó nhấp nháy.
  const stale = query !== deferredQuery

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
          placeholder="Tìm theo tên, Project ID hoặc package name"
          sx={{
            width: '100%',
            maxWidth: 460,
            // Nút xoá mặc định của WebKit không theo bảng màu nên ở chế độ tối
            // nó là một chấm xám lạc lõng. Dùng nút của mình ở dưới.
            'input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
          }}
          slotProps={{
            // `aria-label` phải đặt trên chính thẻ <input>. Truyền thẳng cho
            // TextField thì MUI dán nó lên FormControl bọc ngoài, và trình đọc
            // màn hình vẫn đọc ô này là một ô nhập không tên.
            htmlInput: { 'aria-label': 'Tìm app' },
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
          {searching ? `${results.length} / ${apps.length} app khớp` : `${apps.length} app`}
        </Typography>
      </Stack>

      {results.length === 0 ? (
        <NoMatch query={deferredQuery.trim()} onClear={() => setQuery('')} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 4,
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            opacity: stale ? 0.6 : 1,
            transition: 'opacity 120ms ease',
          }}
        >
          {results.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </Box>
      )}
    </Stack>
  )
}

function AppCard({ app }: { app: FirebaseAppSummary }) {
  return (
    <Card>
      <LinkCardAction href={`/remote-config/${app.slug}`} sx={{ p: 5 }}>
        <Stack spacing={3}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5">{app.displayName}</Typography>
            <Typography
              variant="caption"
              sx={{ color: m3('onSurfaceVariant'), fontFamily: MONO_FONT_STACK, display: 'block' }}
            >
              {app.projectId}
            </Typography>
            {app.packageName !== null && (
              <Typography
                variant="caption"
                sx={{ color: m3('outline'), fontFamily: MONO_FONT_STACK, display: 'block' }}
              >
                {app.packageName}
              </Typography>
            )}
          </Box>

          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
            {app.role !== null && <StatusChip>{APP_ROLE_LABEL[app.role]}</StatusChip>}
            {app.hasCredential ? (
              <StatusChip tone="ok" dot>
                đã nối Firebase
              </StatusChip>
            ) : (
              <StatusChip tone="bad" dot>
                chưa gắn service account
              </StatusChip>
            )}
            {!app.isActive && <StatusChip tone="warn">đã ngừng</StatusChip>}
          </Stack>
        </Stack>
      </LinkCardAction>
    </Card>
  )
}

/**
 * Không có app nào khớp. Chỗ này không được để trống: một vùng trắng không nói
 * cho người dùng biết họ đang thấy kết quả rỗng hay trang bị hỏng.
 */
function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <Stack spacing={4} sx={{ alignItems: 'center', py: 14, textAlign: 'center' }}>
      <SearchOffIcon sx={{ fontSize: 44, color: m3('outline') }} />
      <Box>
        <Typography variant="subtitle1">Không có app nào khớp “{query}”</Typography>
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 1, maxWidth: '52ch' }}>
          Ô này tìm theo tên hiển thị, Firebase Project ID, package name và định danh trên URL. Gõ
          không dấu vẫn ra app đặt tên có dấu.
        </Typography>
      </Box>
      <Button variant="outlined" size="small" onClick={onClear}>
        Xoá ô tìm kiếm
      </Button>
    </Stack>
  )
}
