'use client'

import DescriptionIcon from '@mui/icons-material/Description'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useRef, useState } from 'react'

import { MAX_SOURCE_BYTES } from '@/domain/translation/validation/validateStringsXml'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Vùng nhận tệp: kéo thả hoặc bấm để chọn.
 *
 * Ba lỗi rẻ tiền được bắt ngay ở đây, trước cả bộ soi nội dung — sai đuôi tệp,
 * tệp quá lớn, tệp không đọc được. Cả ba đều nói được ngay mà không cần nhìn
 * vào nội dung, và nói ngay thì người dùng sửa được ngay.
 */
export interface FileDropZoneProps {
  fileName: string | null
  disabled?: boolean
  onFile: (fileName: string, content: string) => void
  onClear: () => void
  onError: (message: string) => void
}

export function FileDropZone({ fileName, disabled = false, onFile, onClear, onError }: FileDropZoneProps) {
  const input = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const accept = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (file === undefined) return

      if (!file.name.toLowerCase().endsWith('.xml')) {
        onError(`"${file.name}" không phải tệp .xml.`)
        return
      }
      if (file.size > MAX_SOURCE_BYTES) {
        onError(`Tệp lớn hơn ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB nên không nhận.`)
        return
      }

      try {
        onFile(file.name, await file.text())
      } catch {
        onError('Không đọc được nội dung tệp. Kiểm tra lại quyền truy cập tệp.')
      }
    },
    [onFile, onError],
  )

  const loaded = fileName !== null

  return (
    <Box
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(false)
        void accept(event.dataTransfer.files[0])
      }}
      sx={{
        border: `1.5px dashed ${dragging ? m3('primary') : m3('outlineVariant')}`,
        borderRadius: `${m3Shape.medium}px`,
        backgroundColor: dragging ? m3('primaryContainer') : m3('surfaceContainerLow'),
        px: 5,
        py: loaded ? 4 : 8,
        textAlign: 'center',
        transition: 'background-color 120ms ease, border-color 120ms ease',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".xml,text/xml,application/xml"
        hidden
        onChange={(event) => {
          void accept(event.target.files?.[0])
          // Xoá giá trị để chọn LẠI đúng tệp vừa chọn vẫn kích hoạt `change`.
          event.target.value = ''
        }}
      />

      {loaded ? (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
          <DescriptionIcon sx={{ color: m3('primary') }} />
          <Typography sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
            {fileName}
          </Typography>
          <Button size="small" onClick={() => input.current?.click()} disabled={disabled}>
            Đổi tệp
          </Button>
          <Button size="small" color="error" onClick={onClear} disabled={disabled}>
            Bỏ tệp
          </Button>
        </Stack>
      ) : (
        <Stack sx={{ alignItems: 'center', gap: 3 }}>
          <UploadFileIcon sx={{ fontSize: 38, color: m3('outline') }} />
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
            Kéo tệp <strong>strings.xml</strong> vào đây, hoặc chọn từ máy.
          </Typography>
          <Button variant="contained" onClick={() => input.current?.click()} disabled={disabled}>
            Chọn tệp strings.xml
          </Button>
          <Typography variant="caption" sx={{ color: m3('outline') }}>
            Thường nằm ở app/src/main/res/values/strings.xml
          </Typography>
        </Stack>
      )}
    </Box>
  )
}
