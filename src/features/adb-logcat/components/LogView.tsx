'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef } from 'react'

import type { LogLevel, LogcatLine } from '@/domain/adb/entities/LogcatLine'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Khung log.
 *
 * ─── Vì sao chỉ vẽ một khúc cuối ───
 *
 * Đệm giữ tới 5000 dòng, nhưng 5000 hàng DOM thì mỗi lần thêm dòng mới trình
 * duyệt phải tính lại bố cục của cả 5000 — và log chảy nhanh nhất đúng lúc app
 * khởi động, tức là lúc người ta đang nhìn. Vẽ 1500 dòng cuối là đủ để cuộn
 * ngược lên một quãng dài mà vẫn mượt; muốn xem xa hơn thì lọc, hoặc tải tệp
 * về. Con số này được nói ra trên màn hình chứ không giấu đi.
 *
 * ─── Vì sao không dùng thư viện ảo hoá ───
 *
 * Ảo hoá đúng cách đòi hỏi biết trước chiều cao mỗi hàng, mà một dòng log có
 * thể dài vài trăm ký tự và xuống dòng thành ba hàng. Đo động thì kéo theo một
 * `ResizeObserver` cho mỗi hàng — đắt hơn chính thứ nó định tối ưu.
 */
export const MAX_RENDERED_LINES = 1500

const LEVEL_COLOR: Record<LogLevel, string> = {
  V: m3('outline'),
  D: m3('onSurfaceVariant'),
  I: m3('tertiary'),
  W: m3('warning'),
  E: m3('error'),
  F: m3('error'),
}

export interface LogViewProps {
  lines: readonly LogcatLine[]
  searchQuery: string
  autoScroll: boolean
  /** Người dùng tự cuộn lên thì tắt bám đáy; cuộn về đáy thì bật lại. */
  onAutoScrollChange: (value: boolean) => void
  /** Không cuộn khi đang tạm dừng, dù `autoScroll` vẫn bật. */
  frozen: boolean
  emptyHint: string
}

/** Khoảng cách tới đáy vẫn tính là "đang ở đáy". Một dòng rưỡi. */
const BOTTOM_SLACK = 32

export function LogView({
  lines,
  searchQuery,
  autoScroll,
  onAutoScrollChange,
  frozen,
  emptyHint,
}: LogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const rendered = lines.length > MAX_RENDERED_LINES ? lines.slice(-MAX_RENDERED_LINES) : lines
  const hidden = lines.length - rendered.length

  // `useLayoutEffect` chứ không phải `useEffect`: cuộn phải xảy ra trong cùng
  // khung hình với lần vẽ thêm dòng mới. Chậm một khung là mắt thấy giật.
  useLayoutEffect(() => {
    if (!autoScroll || frozen) return
    const node = containerRef.current
    if (node === null) return
    node.scrollTop = node.scrollHeight
  }, [rendered.length, autoScroll, frozen])

  // Người dùng cuộn tay: bám đáy tắt khi rời đáy, bật lại khi quay về đáy.
  useEffect(() => {
    const node = containerRef.current
    if (node === null) return

    const onScroll = (): void => {
      const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_SLACK
      if (atBottom !== autoScroll) onAutoScrollChange(atBottom)
    }

    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [autoScroll, onAutoScrollChange])

  return (
    <Box
      ref={containerRef}
      sx={{
        height: 'clamp(320px, 58vh, 720px)',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        border: `1px solid ${m3('outlineVariant')}`,
        borderRadius: `${m3Shape.large}px`,
        backgroundColor: m3('surfaceContainerLowest'),
        fontFamily: MONO_FONT_STACK,
        fontSize: '0.78rem',
        lineHeight: 1.55,
        py: 2,
      }}
    >
      {rendered.length === 0 ? (
        <Typography
          variant="body2"
          sx={{ color: m3('onSurfaceVariant'), p: 5, fontFamily: 'inherit' }}
        >
          {emptyHint}
        </Typography>
      ) : (
        <>
          {hidden > 0 && (
            <Box sx={{ px: 4, py: 2, color: m3('outline') }}>
              ⋯ {hidden.toLocaleString('vi-VN')} dòng cũ hơn không được vẽ ra. Lọc bớt, hoặc tải tệp
              về để xem đủ.
            </Box>
          )}
          {rendered.map((line) => (
            <Row key={line.seq} line={line} searchQuery={searchQuery} />
          ))}
        </>
      )}
    </Box>
  )
}

function Row({ line, searchQuery }: { line: LogcatLine; searchQuery: string }) {
  const color = LEVEL_COLOR[line.level]
  const severe = line.level === 'E' || line.level === 'F'

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 3,
        px: 4,
        py: 0.25,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        backgroundColor: severe ? m3('errorContainer') : 'transparent',
        '&:hover': { backgroundColor: severe ? m3('errorContainer') : m3('surfaceContainer') },
      }}
    >
      <Box component="span" sx={{ color: m3('outline'), flexShrink: 0 }}>
        {line.time}
      </Box>
      <Box component="span" sx={{ color, fontWeight: 700, flexShrink: 0, width: '1ch' }}>
        {line.level}
      </Box>
      <Box
        component="span"
        sx={{
          color: m3('onSurfaceVariant'),
          flexShrink: 0,
          width: '18ch',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={line.tag}
      >
        {line.tag}
      </Box>
      <Box
        component="span"
        sx={{
          color: severe ? m3('onErrorContainer') : m3('onSurface'),
          minWidth: 0,
          '& mark': {
            borderRadius: '3px',
            backgroundColor: m3('warningContainer'),
            color: m3('onWarningContainer'),
            paddingInline: '2px',
          },
        }}
      >
        {highlightText(line.message, searchQuery)}
      </Box>
    </Box>
  )
}

function highlightText(text: string, query: string): ReactNode {
  const needle = query.trim()
  if (needle.length === 0) return text

  const parts: ReactNode[] = []
  const lowerText = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let cursor = 0
  let index = lowerText.indexOf(lowerNeedle)

  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index))

    const end = index + needle.length
    parts.push(
      <Box key={`${index}-${end}`} component="mark">
        {text.slice(index, end)}
      </Box>,
    )
    cursor = end
    index = lowerText.indexOf(lowerNeedle, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.length === 0 ? text : parts
}
