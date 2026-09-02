'use client'

import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { SUPPORTED_LANGUAGES, valuesDirectory } from '@/domain/translation/entities/LanguageCode'
import { m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Chọn ngôn ngữ đích.
 *
 * Mỗi viên hiện cả tên tiếng Việt lẫn TÊN THƯ MỤC sẽ tạo ra (`values-in`), vì
 * người bấm nút này là người sẽ chép thư mục đó vào dự án Android. Mã thư mục
 * không phải lúc nào cũng đoán được từ tên ngôn ngữ — Indonesia ra `values-in`
 * chứ không phải `values-id`.
 */
export interface LanguagePickerProps {
  selected: readonly string[]
  disabled?: boolean
  onToggle: (code: string) => void
  onToggleAll: (value: boolean) => void
}

export function LanguagePicker({ selected, disabled = false, onToggle, onToggleAll }: LanguagePickerProps) {
  const all = selected.length === SUPPORTED_LANGUAGES.length

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          Đã chọn <strong>{selected.length}</strong>/{SUPPORTED_LANGUAGES.length} ngôn ngữ. Mỗi ngôn
          ngữ là một thư mục trong tệp zip.
        </Typography>
        <Button size="small" onClick={() => onToggleAll(!all)} disabled={disabled}>
          {all ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </Button>
      </Stack>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {SUPPORTED_LANGUAGES.map((language) => {
          const active = selected.includes(language.code)
          return (
            <Box
              key={language.code}
              component="button"
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(language.code)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1.5,
                border: `1px solid ${active ? m3('primary') : m3('outlineVariant')}`,
                borderRadius: `${m3Shape.full}px`,
                backgroundColor: active ? m3('primaryContainer') : 'transparent',
                color: active ? m3('onPrimaryContainer') : m3('onSurfaceVariant'),
                paddingInline: '12px',
                paddingBlock: '6px',
                font: 'inherit',
                fontSize: '0.82rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.55 : 1,
                transition: 'background-color 120ms ease, border-color 120ms ease',
                '&:hover': disabled ? undefined : { borderColor: m3('primary') },
              }}
            >
              {active ? <CheckIcon sx={{ fontSize: 14 }} /> : null}
              {language.label}
              <Box component="span" sx={{ ...m3Mono.chip, textTransform: 'none', opacity: 0.68 }}>
                {valuesDirectory(language.code)}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Stack>
  )
}
