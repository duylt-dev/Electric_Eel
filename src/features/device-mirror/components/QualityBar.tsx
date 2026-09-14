'use client'

import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'

import {
  MIRROR_BIT_RATES_MBPS,
  MIRROR_FPS,
  MIRROR_MAX_SIZES,
} from '@/domain/device-mirror/entities/MirrorRequest'
import type { MirrorQuality } from '../DeviceMirrorContract'

export interface QualityBarProps {
  quality: MirrorQuality
  /** Khoá cả ba ô trong lúc đang nối — đổi giữa chừng chỉ làm rối, không làm gì. */
  disabled: boolean
  onChange: (quality: MirrorQuality) => void
}

/** Một ô chọn: trường nào của `MirrorQuality`, các giá trị cho phép, cách hiện, và hậu quả khi đổi. */
interface QualityField {
  readonly key: keyof MirrorQuality
  readonly label: string
  readonly values: readonly number[]
  readonly format: (value: number) => string
  readonly hint: string
}

const FIELDS: readonly QualityField[] = [
  {
    key: 'maxSize',
    label: 'Độ phân giải',
    values: MIRROR_MAX_SIZES,
    format: (size) => (size === 0 ? 'Gốc' : `${String(size)}p`),
    hint: 'Cao hơn = nét hơn nhưng trễ hơn trên máy yếu.',
  },
  {
    key: 'maxFps',
    label: 'Khung hình/giây',
    values: MIRROR_FPS,
    format: (fps) => `${String(fps)} fps`,
    hint: 'Cao hơn = mượt hơn nhưng nặng hơn cho máy chủ.',
  },
  {
    key: 'bitRateMbps',
    label: 'Bit rate',
    values: MIRROR_BIT_RATES_MBPS,
    format: (rate) => `${String(rate)} Mbps`,
    hint: 'Cao hơn = nét hơn nhưng tốn băng thông hơn.',
  },
]

/**
 * Ba lựa chọn chất lượng scrcpy.
 *
 * Mỗi lần đổi là dừng luồng cũ và mở luồng mới — scrcpy không có API "đổi
 * tham số giữa chừng" (xem `mirrorStream.ts`). `helperText` nói thẳng hậu
 * quả đó, không chỉ nhắc lại tên trường, để người dùng không bấm liên tục
 * tưởng là đang chỉnh mượt một thanh trượt.
 *
 * Giá trị đi qua `Select` thành chuỗi rồi `Number()` ngược lại; ép kiểu về
 * `MirrorQuality` ở đây là an toàn vì `values` chỉ chứa đúng các literal mà
 * `MirrorRequest` cho phép — `normalizeMirrorRequest` ở máy chủ vẫn kiểm lại.
 */
export function QualityBar({ quality, disabled, onChange }: QualityBarProps) {
  return (
    <Stack direction="row" sx={{ gap: 4, flexWrap: 'wrap' }}>
      {FIELDS.map((field) => {
        const id = `mirror-quality-${field.key}`
        return (
          <FormControl key={field.key} size="small" disabled={disabled} sx={{ minWidth: 170 }}>
            <InputLabel id={id}>{field.label}</InputLabel>
            <Select<number>
              labelId={id}
              label={field.label}
              value={quality[field.key]}
              onChange={(event) =>
                onChange({ ...quality, [field.key]: Number(event.target.value) } as MirrorQuality)
              }
            >
              {field.values.map((value) => (
                <MenuItem key={value} value={value}>
                  {field.format(value)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{field.hint} Đổi sẽ nối lại luồng.</FormHelperText>
          </FormControl>
        )
      })}
    </Stack>
  )
}
