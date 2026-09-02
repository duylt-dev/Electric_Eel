'use client'

import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { findLanguage } from '@/domain/translation/entities/LanguageCode'
import { StatusChip } from '@/ui/components/StatusChip'
import { m3 } from '@/ui/theme/m3Tokens'
import type { LanguageProgress } from '../StringTranslatorContract'

/**
 * Tiến độ của lượt đang chạy.
 *
 * Hiện từng ngôn ngữ ngay khi nó xong chứ không chỉ hiện một con số phần trăm:
 * lượt dịch kéo dài vài phút, và thứ trấn an người ngồi chờ là thấy tên ngôn
 * ngữ mới hiện ra đều đặn. Một ngôn ngữ hỏng cũng lộ ra ngay tại đây thay vì
 * đợi tới bảng tổng kết ở cuối.
 */
export interface TranslationProgressProps {
  finished: readonly LanguageProgress[]
  running: number
  ratio: number
}

export function TranslationProgress({ finished, running, ratio }: TranslationProgressProps) {
  const failedCount = finished.filter((item) => !item.ok).length

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 3 }}>
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          Đã xong <strong>{finished.length}</strong>/{running} ngôn ngữ
          {failedCount > 0 ? ` · ${failedCount} hỏng` : ''}
        </Typography>
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          {Math.round(ratio * 100)}%
        </Typography>
      </Stack>

      <LinearProgress
        variant={finished.length === 0 ? 'indeterminate' : 'determinate'}
        value={ratio * 100}
      />

      {finished.length === 0 ? null : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {finished.map((item) => (
            <StatusChip key={item.code} tone={item.ok ? 'ok' : 'bad'} dot>
              {findLanguage(item.code)?.label ?? item.code}
            </StatusChip>
          ))}
        </Box>
      )}
    </Stack>
  )
}
