'use client'

import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import {
  NATIVE_TEMPLATES,
  NATIVE_TEMPLATE_GROUP_LABEL,
  isKnownNativeTemplate,
} from '@/domain/ads/entities/NativeTemplate'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'

/**
 * Ô chọn bố cục native.
 *
 * Danh sách lấy từ NATIVE_TEMPLATES — sinh ra từ chính ConfigAds.kt — chứ
 * KHÔNG lấy từ năm mảng `listTemplate*` nằm trong file config. SDK không đọc
 * năm mảng ấy, và trên thực tế chúng đã lệch khỏi code: từng chứa ba tên mà SDK
 * không dựng được, đồng thời thiếu một tên SDK dựng được.
 *
 * Lấy sai nguồn thì tool này sẽ mời người dùng chọn những bố cục không tồn tại,
 * rồi họ ngồi tự hỏi vì sao giao diện không đổi. Đúng loại lỗi tool sinh ra để
 * chặn.
 */
export function TemplatePicker({
  value,
  onChange,
  disabled,
  help,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  help?: string
}) {
  const unknown = value.length > 0 && !isKnownNativeTemplate(value)

  return (
    <Autocomplete
      options={[...NATIVE_TEMPLATES]}
      groupBy={(option) => NATIVE_TEMPLATE_GROUP_LABEL[option.group]}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.id)}
      value={NATIVE_TEMPLATES.find((template) => template.id === value) ?? null}
      onChange={(_event, option) => onChange(option?.id ?? '')}
      disabled={disabled}
      freeSolo={false}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, option) => {
        const { key, ...rest } = props as { key: string } & Record<string, unknown>
        return (
          <Box component="li" key={key} {...rest}>
            <Typography variant="body2" sx={{ fontFamily: MONO_FONT_STACK }}>
              {option.id}
            </Typography>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Bố cục"
          error={unknown}
          helperText={
            unknown
              ? `SDK không dựng được "${value}" — nó sẽ im lặng dùng bố cục mặc định. Chọn lại một tên trong danh sách.`
              : (help ?? `${NATIVE_TEMPLATES.length} bố cục SDK dựng được`)
          }
        />
      )}
      slotProps={{
        chip: { size: 'small' },
        paper: { sx: { bgcolor: m3('surfaceContainerHigh') } },
      }}
    />
  )
}

/** Nhãn nhỏ hiện tên bố cục kèm cảnh báo nếu SDK không dựng được. */
export function TemplateChip({ template }: { template: string | undefined }) {
  if (template === undefined || template === '') return null
  const known = isKnownNativeTemplate(template)

  return (
    <Chip
      size="small"
      variant={known ? 'outlined' : 'filled'}
      label={template}
      sx={{
        fontFamily: MONO_FONT_STACK,
        fontSize: 11,
        ...(known ? {} : { bgcolor: m3('errorContainer'), color: m3('onErrorContainer') }),
      }}
    />
  )
}
