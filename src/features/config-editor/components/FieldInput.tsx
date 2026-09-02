'use client'

import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import type { FieldDescriptor, RootFieldDescriptor } from '../placementFields'
import { TemplatePicker } from './TemplatePicker'

/**
 * Một ô nhập, dựng từ mô tả trường.
 *
 * Mỗi nhánh `kind` là một cách hiển thị; thêm kiểu mới chỉ cần thêm một nhánh,
 * và mọi biểu mẫu trong ứng dụng lập tức dùng được kiểu đó.
 *
 * Ô nào cũng hiện giá trị mặc định của SDK khi đang bỏ trống. Đây là câu hỏi
 * đầu tiên của người mới — "không điền thì sao?" — và trả lời ngay tại chỗ thì
 * không ai phải đi hỏi.
 */
export interface FieldInputProps {
  descriptor: FieldDescriptor | RootFieldDescriptor
  value: unknown
  onChange: (value: unknown) => void
  onClear?: () => void
  disabled?: boolean
}

const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === ''

const renderDefault = (value: unknown): string => {
  if (value === null || value === undefined) return 'không đặt'
  if (typeof value === 'boolean') return value ? 'bật' : 'tắt'
  if (value === '') return 'rỗng'
  return String(value)
}

export function FieldInput({ descriptor, value, onChange, onClear, disabled }: FieldInputProps) {
  const help = (
    <>
      {descriptor.help}
      {isEmpty(value) && (
        <>
          {' '}
          <Box component="span" sx={{ opacity: 0.8 }}>
            Bỏ trống thì SDK dùng: <strong>{renderDefault(descriptor.defaultValue)}</strong>.
          </Box>
        </>
      )}
    </>
  )

  switch (descriptor.kind) {
    case 'boolean':
      return (
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={value === true}
                onChange={(event) => onChange(event.target.checked)}
                disabled={disabled}
              />
            }
            label={descriptor.label}
          />
          <FormHelperText sx={{ ml: 0 }}>{descriptor.help}</FormHelperText>
        </Box>
      )

    case 'number':
      return (
        <TextField
          label={descriptor.label}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
          helperText={help}
          disabled={disabled}
          fullWidth
          slotProps={{
            htmlInput: { min: descriptor.min, max: descriptor.max },
            input:
              descriptor.unit !== undefined
                ? { endAdornment: <InputAdornment position="end">{descriptor.unit}</InputAdornment> }
                : undefined,
          }}
        />
      )

    case 'select':
      return (
        <TextField
          select
          label={descriptor.label}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => {
            const raw = event.target.value
            const match = descriptor.options?.find((option) => String(option.value) === raw)
            onChange(match?.value ?? raw)
          }}
          helperText={help}
          disabled={disabled}
          fullWidth
        >
          {descriptor.options?.map((option) => (
            <MenuItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )

    case 'color':
      return (
        <ColorField
          label={descriptor.label}
          help={help}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          onClear={onClear}
          disabled={disabled}
        />
      )

    case 'colorList':
      return (
        <ColorListField
          label={descriptor.label}
          help={help}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
        />
      )

    case 'template':
      return (
        <TemplatePicker
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          disabled={disabled}
          help={descriptor.help}
        />
      )

    case 'text':
      return (
        <TextField
          label={descriptor.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          helperText={help}
          disabled={disabled}
          fullWidth
        />
      )
  }
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function ColorField({
  label,
  help,
  value,
  onChange,
  onClear,
  disabled,
}: {
  label: string
  help: React.ReactNode
  value: string
  onChange: (value: unknown) => void
  onClear?: () => void
  disabled?: boolean
}) {
  const valid = value === '' || HEX.test(value)

  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={!valid}
      helperText={valid ? help : 'Mã màu phải có dạng #RRGGBB hoặc #AARRGGBB.'}
      disabled={disabled}
      fullWidth
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              {/* Ô xem trước bằng input màu thật: bấm vào mở bảng chọn của hệ điều hành. */}
              <Box
                component="input"
                type="color"
                aria-label={`Chọn ${label}`}
                value={HEX.test(value) && value.length === 7 ? value : '#000000'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                disabled={disabled}
                sx={{
                  width: 24,
                  height: 24,
                  p: 0,
                  border: `1px solid ${m3('outline')}`,
                  borderRadius: `${m3Shape.extraSmall}px`,
                  background: 'none',
                  cursor: disabled === true ? 'default' : 'pointer',
                }}
              />
            </InputAdornment>
          ),
          endAdornment:
            onClear !== undefined && value !== '' ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={onClear} aria-label="Xoá giá trị" disabled={disabled}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
        },
      }}
    />
  )
}

function ColorListField({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string
  help: React.ReactNode
  value: string[]
  onChange: (value: unknown) => void
  disabled?: boolean
}) {
  const update = (index: number, next: string) =>
    onChange(value.map((color, position) => (position === index ? next : color)))

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        {label}
      </Typography>

      <Stack spacing={2}>
        {value.map((color, index) => (
          <Stack key={index} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <ColorField
              label={`Màu ${index + 1}`}
              help=""
              value={color}
              onChange={(next) => update(index, String(next))}
              disabled={disabled}
            />
            <IconButton
              size="small"
              aria-label={`Xoá màu ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((_, position) => position !== index))}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}

        <Stack direction="row" spacing={2}>
          <IconButton
            size="small"
            aria-label="Thêm màu"
            disabled={disabled}
            onClick={() => onChange([...value, '#000000'])}
          >
            <AddIcon fontSize="small" />
          </IconButton>
          {value.length > 0 && (
            <Box
              aria-hidden
              sx={{
                flex: 1,
                height: 32,
                borderRadius: `${m3Shape.small}px`,
                border: `1px solid ${m3('outlineVariant')}`,
                background:
                  value.length === 1
                    ? value[0]
                    : `linear-gradient(90deg, ${value.filter((color) => HEX.test(color)).join(', ')})`,
              }}
            />
          )}
        </Stack>
      </Stack>

      <FormHelperText sx={{ ml: 0 }}>{help}</FormHelperText>
    </Box>
  )
}
