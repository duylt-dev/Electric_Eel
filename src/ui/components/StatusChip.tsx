import Box from '@mui/material/Box'
import type { ReactNode } from 'react'

import { m3, m3Mono, m3Shape } from '../theme/m3Tokens'

/**
 * Nhãn trạng thái nhỏ, chữ đơn cách viết hoa.
 *
 * Vì sao không dùng `<Chip>` của MUI: Chip được thiết kế để bấm và để xoá, nên
 * nó mang theo chiều cao 32px, vùng chạm và hiệu ứng gợn sóng. Ở đây cần thứ
 * ngược lại — một dấu hiệu chỉ để đọc, đủ nhỏ để nằm lọt trong một ô bảng mà
 * không đẩy dòng cao lên.
 *
 * Sắc thái đặt tên theo *hậu quả* chứ không theo màu: người viết mã chọn
 * `tone="bad"` vì việc đó chặn publish, không phải vì họ muốn màu đỏ.
 */
export type StatusTone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad'

const TONE: Record<StatusTone, { background: string; color: string }> = {
  neutral: { background: m3('surfaceContainerHigh'), color: m3('onSurfaceVariant') },
  info: { background: m3('primaryContainer'), color: m3('onPrimaryContainer') },
  ok: { background: m3('tertiaryContainer'), color: m3('onTertiaryContainer') },
  warn: { background: m3('warningContainer'), color: m3('onWarningContainer') },
  bad: { background: m3('errorContainer'), color: m3('onErrorContainer') },
}

export interface StatusChipProps {
  tone?: StatusTone
  children: ReactNode
  /** Chấm tròn dẫn đầu — dùng khi nhãn nằm lẫn trong một danh sách dài. */
  dot?: boolean
}

export function StatusChip({ tone = 'neutral', children, dot = false }: StatusChipProps) {
  const { background, color } = TONE[tone]

  return (
    <Box
      component="span"
      sx={{
        ...m3Mono.chip,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: `${m3Shape.extraSmall + 2}px`,
        paddingInline: '7px',
        paddingBlock: '2px',
        whiteSpace: 'nowrap',
        backgroundColor: background,
        color,
      }}
    >
      {dot ? (
        <Box
          component="span"
          aria-hidden
          sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'currentColor', flex: 'none' }}
        />
      ) : null}
      {children}
    </Box>
  )
}
