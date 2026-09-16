'use client'

import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import { SearchField } from '@/ui/components/SearchField'
import { m3 } from '@/ui/theme/m3Tokens'

/**
 * Thanh công cụ trên một bảng quản trị: ô tìm kiếm bên trái, các ô lọc, và
 * câu đếm "12 / 40 khớp" bên phải.
 *
 * Hai bảng quản trị dùng đúng cùng bố cục này; tách ra để chúng không lệch
 * nhau vài pixel rồi trông như hai người viết.
 */
export function TableToolbar({
  query,
  onQueryChange,
  placeholder,
  searchLabel,
  filters,
  shown,
  total,
  unit,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
  searchLabel: string
  filters?: ReactNode
  shown: number
  total: number
  unit: string
}) {
  const filtering = shown !== total

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      sx={{ gap: 3, alignItems: { md: 'center' } }}
    >
      <SearchField
        size="small"
        value={query}
        onChange={onQueryChange}
        placeholder={placeholder}
        label={searchLabel}
        sx={{ maxWidth: { md: 360 } }}
      />
      {filters}
      <Typography
        variant="caption"
        sx={{ color: m3('onSurfaceVariant'), flexShrink: 0, ml: { md: 'auto' }, fontVariantNumeric: 'tabular-nums' }}
      >
        {filtering ? `${shown} / ${total} ${unit} khớp` : `${total} ${unit}`}
      </Typography>
    </Stack>
  )
}

/** Một ô lọc chọn sẵn, cỡ nhỏ để đứng ngang hàng với ô tìm kiếm. */
export function FilterSelect<V extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: V
  onChange: (value: V) => void
  options: readonly { value: V; label: string }[]
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as V)}
      sx={{ minWidth: 170 }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  )
}
