'use client'

import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import type { SxProps, Theme } from '@mui/material/styles'

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Tên cho trình đọc màn hình; ô này không có nhãn nhìn thấy. */
  label: string
  autoFocus?: boolean
  /** `medium` cho ô đứng một mình đầu trang, `small` khi nằm trên thanh công cụ của bảng. */
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

/**
 * Ô tìm kiếm dùng chung: icon kính lúp, nút xoá riêng, Escape để xoá.
 *
 * Nó không biết tìm cái gì — bên gọi giữ chuỗi và tự lọc (thường qua
 * `core/util/textSearch`). Tách ra vì ba bảng cần đúng cùng một ô, và một ô
 * tìm kiếm trông khác nhau ở ba trang thì người dùng tưởng chúng tìm khác nhau.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  size = 'medium',
  sx,
}: SearchFieldProps) {
  return (
    <TextField
      type="search"
      size={size}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onChange('')
      }}
      placeholder={placeholder}
      sx={[
        {
          width: '100%',
          maxWidth: 460,
          // Nút xoá mặc định của WebKit không theo bảng màu nên ở chế độ tối
          // nó là một chấm xám lạc lõng. Dùng nút của mình ở dưới.
          'input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      slotProps={{
        // `aria-label` phải đặt trên chính thẻ <input>. Truyền thẳng cho
        // TextField thì MUI dán nó lên FormControl bọc ngoài, và trình đọc
        // màn hình vẫn đọc ô này là một ô nhập không tên.
        htmlInput: { 'aria-label': label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment:
            value.length === 0 ? null : (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Xoá ô tìm kiếm" onClick={() => onChange('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
        },
      }}
    />
  )
}
