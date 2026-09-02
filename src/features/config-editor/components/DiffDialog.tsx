'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { countChanges, describeChange } from '@/domain/ads/AdsDiff'
import type { AdsDiff, EntityChange, FieldChange } from '@/domain/ads/AdsDiff'
import type { FindingSummary } from '@/domain/ads/validation/Finding'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'
import { FindingList } from './FindingList'
import type { Finding } from '@/domain/ads/validation/Finding'

const KIND_LABEL = { added: 'Thêm mới', removed: 'Xoá đi', changed: 'Sửa' } as const

const KIND_STYLE = {
  added: { bgcolor: m3('secondaryContainer'), color: m3('onSecondaryContainer') },
  removed: { bgcolor: m3('errorContainer'), color: m3('onErrorContainer') },
  changed: { bgcolor: m3('surfaceContainerHigh'), color: m3('onSurface') },
} as const

/**
 * Bản đối chiếu trước khi đẩy lên Firebase.
 *
 * So sánh theo TỪNG TRƯỜNG, không theo dòng văn bản. Cả tài liệu JSON nằm gọn
 * trên một dòng, nên diff dạng dòng chỉ nói được "dòng 1 đã đổi" — vô dụng.
 * Còn "home-bottom · isOn: false → true" thì người duyệt đọc được và quyết định
 * được.
 */
export function DiffDialog({
  open,
  diff,
  summary,
  warnings,
  warningsAcknowledged,
  publishing,
  canPublish,
  onAcknowledge,
  onClose,
  onPublish,
}: {
  open: boolean
  diff: AdsDiff
  summary: FindingSummary
  warnings: readonly Finding[]
  warningsAcknowledged: boolean
  publishing: boolean
  canPublish: boolean
  onAcknowledge: (value: boolean) => void
  onClose: () => void
  onPublish: () => void
}) {
  const total = countChanges(diff)
  const blocked = summary.error > 0
  const needsAcknowledgement = summary.warning > 0 && !warningsAcknowledged

  return (
    <Dialog open={open} onClose={publishing ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Đối chiếu trước khi đẩy lên
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          {total === 0 ? 'Không có thay đổi nào' : `${total} thay đổi`}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={4}>
          {blocked && (
            <Alert severity="error">
              Còn {summary.error} lỗi chưa xử lý. Mỗi lỗi trong danh sách đều đã được chứng minh là gây
              hậu quả thật — mất doanh thu, quảng cáo không hiện, hoặc SDK đọc sai. Không có cách bỏ qua.
            </Alert>
          )}

          {diff.rootChanges.length > 0 && (
            <ChangeSection title="Cấu hình chung (config_show_ads)" fields={diff.rootChanges} />
          )}
          {diff.admobRootChanges.length > 0 && (
            <ChangeSection title="Thông tin ứng dụng (admob_id)" fields={diff.admobRootChanges} />
          )}
          {diff.placements.length > 0 && (
            <EntitySection title="Vị trí quảng cáo" changes={diff.placements} />
          )}
          {diff.adUnits.length > 0 && <EntitySection title="Ad unit" changes={diff.adUnits} />}

          {total === 0 && (
            <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
              Bản nháp giống hệt bản đang chạy trên Firebase.
            </Typography>
          )}

          {summary.warning > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                {summary.warning} cảnh báo
              </Typography>
              <FindingList findings={warnings} max={8} />

              <FormControlLabel
                sx={{ mt: 3 }}
                control={
                  <Checkbox
                    checked={warningsAcknowledged}
                    onChange={(event) => onAcknowledge(event.target.checked)}
                  />
                }
                label="Tôi đã đọc các cảnh báo trên và cố ý để như vậy"
              />
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={publishing}>
          Quay lại
        </Button>
        <Button
          variant="contained"
          onClick={onPublish}
          disabled={publishing || blocked || needsAcknowledgement || total === 0 || !canPublish}
        >
          {publishing ? 'Đang đẩy lên…' : 'Đẩy lên Firebase'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ChangeSection({ title, fields }: { title: string; fields: readonly FieldChange[] }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Stack spacing={1}>
        {fields.map((change) => (
          <Typography key={change.field} variant="body2" sx={{ fontFamily: MONO_FONT_STACK, fontSize: 13 }}>
            {describeChange(change)}
          </Typography>
        ))}
      </Stack>
    </Box>
  )
}

function EntitySection({ title, changes }: { title: string; changes: readonly EntityChange[] }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        {title} · {changes.length} mục
      </Typography>

      <Stack spacing={2}>
        {changes.map((change) => (
          <Box
            key={`${change.kind}-${change.name}`}
            sx={{
              p: 3,
              borderRadius: `${m3Shape.small}px`,
              ...KIND_STYLE[change.kind],
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: change.fields.length > 0 ? 2 : 0 }}>
              <Chip size="small" label={KIND_LABEL[change.kind]} variant="outlined" />
              <Typography variant="body2" sx={{ fontFamily: MONO_FONT_STACK, fontWeight: 600 }}>
                {change.name}
              </Typography>
            </Stack>

            <Stack spacing={1}>
              {change.fields.map((field) => (
                <Typography key={field.field} variant="caption" sx={{ fontFamily: MONO_FONT_STACK }}>
                  {describeChange(field)}
                </Typography>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
