'use client'

import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { findLanguage } from '@/domain/translation/entities/LanguageCode'
import { StatusChip } from '@/ui/components/StatusChip'
import { m3 } from '@/ui/theme/m3Tokens'
import type { LanguageProgress, RetryWaitProgress } from '../StringTranslatorContract'

/**
 * Tiến độ của lượt đang chạy.
 *
 * Hiện từng ngôn ngữ ngay khi nó xong chứ không chỉ hiện một con số phần trăm:
 * lượt dịch kéo dài vài phút, và thứ trấn an người ngồi chờ là thấy tên ngôn
 * ngữ mới hiện ra đều đặn. Một ngôn ngữ hỏng cũng lộ ra ngay tại đây thay vì
 * đợi tới bảng tổng kết ở cuối.
 *
 * Lúc nhà cung cấp giới hạn tần suất, thanh tiến độ đứng im cả phút là chuyện
 * bình thường — nhưng đứng im mà không nói gì thì trông hệt như treo. Dòng
 * "đang chờ hạn mức" ở dưới là để phân biệt hai chuyện đó.
 */
export interface TranslationProgressProps {
  finished: readonly LanguageProgress[]
  waiting: readonly RetryWaitProgress[]
  running: number
  ratio: number
}

const languageLabel = (code: string): string => findLanguage(code)?.label ?? code

/** "Tiếng Việt (12s, lần 2/5) · 日本語 (40s, lần 3/5)" */
const describeWaiting = (waiting: readonly RetryWaitProgress[]): string =>
  waiting
    .map((wait) => `${languageLabel(wait.code)} (${wait.seconds}s, lần ${wait.attempt}/${wait.attempts})`)
    .join(' · ')

export function TranslationProgress({ finished, waiting, running, ratio }: TranslationProgressProps) {
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

      {waiting.length === 0 ? null : (
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          Nhà cung cấp đang giới hạn tần suất — chờ rồi gọi lại: {describeWaiting(waiting)}
        </Typography>
      )}

      {finished.length === 0 ? null : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {finished.map((item) => (
            <StatusChip key={item.code} tone={item.ok ? 'ok' : 'bad'} dot>
              {languageLabel(item.code)}
            </StatusChip>
          ))}
        </Box>
      )}
    </Stack>
  )
}
