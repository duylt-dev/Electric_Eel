'use client'

import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined'
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn'
import SendIcon from '@mui/icons-material/Send'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useState } from 'react'

import type { MirrorKey } from '@/domain/device-mirror/entities/MirrorControlMessage'

/** Trùng `MAX_TEXT_LENGTH` ở `validateMirrorControlBatch` — máy chủ từ chối dài hơn. */
const MAX_TEXT_LENGTH = 300

export interface TextInjectorProps {
  disabled: boolean
  onSubmit: (text: string) => void
  onKey: (key: MirrorKey) => void
}

/**
 * Ô gõ chữ vào máy: gõ ở đây rồi Enter (hoặc nút gửi) — chữ đi cả cụm, không
 * bắt từng phím. Không bắt bàn phím toàn cục trên trang: xung đột phím tắt
 * trình duyệt, và IME tiếng Việt gõ từng ký tự dở dang là thứ máy không hiểu.
 *
 * Chữ đang gõ là UI thuần (như ô tìm kiếm tạm) → `useState` cục bộ. Ô này
 * không có nút xoá ô nhập — Enter là gửi và xoá luôn.
 */
export function TextInjector({ disabled, onSubmit, onKey }: TextInjectorProps) {
  const [text, setText] = useState('')

  const submit = (): void => {
    if (text.length === 0) return
    onSubmit(text)
    setText('')
  }

  return (
    <TextField
      size="small"
      fullWidth
      disabled={disabled}
      value={text}
      onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT_LENGTH))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        event.preventDefault()
        submit()
      }}
      placeholder="Gõ chữ vào ô đang chọn trên máy, Enter để gửi"
      helperText="Chọn ô nhập trên máy trước. Chữ không dấu gõ thẳng; chữ có dấu dán qua clipboard của máy — Samsung Android 16 chặn đường này, chữ không hiện."
      slotProps={{
        htmlInput: { 'aria-label': 'Chữ gửi vào máy', maxLength: MAX_TEXT_LENGTH },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Gửi chữ đang gõ">
                <span>
                  <IconButton size="small" aria-label="Gửi" onClick={submit} disabled={disabled || text.length === 0}>
                    <SendIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Bấm Enter trên máy (xác nhận / xuống dòng)">
                <span>
                  <IconButton size="small" aria-label="Enter trên máy" onClick={() => onKey('enter')} disabled={disabled}>
                    <KeyboardReturnIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Xoá một ký tự trên máy">
                <span>
                  <IconButton size="small" aria-label="Backspace trên máy" onClick={() => onKey('backspace')} disabled={disabled}>
                    <BackspaceOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
