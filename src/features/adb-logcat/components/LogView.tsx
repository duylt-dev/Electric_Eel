'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { memo, useEffect, useLayoutEffect, useRef } from 'react'

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
 * ngược lên một quãng dài mà vẫn mượt; muốn xem xa hơn thì lọc bớt. Con số này
 * được nói ra trên màn hình chứ không giấu đi.
 *
 * ─── Vì sao cỡ chữ và độ thoáng như hiện tại ───
 *
 * Người dùng ngồi trước khung này hàng giờ. Bản đầu dùng 0.78rem / dòng sát
 * nhau để thấy nhiều dòng, và cái giá là mỏi mắt, nhảy dòng khi đọc — một log
 * thấy được 40 dòng mà đọc sai dòng thì tệ hơn thấy 30 dòng đọc đúng. Cỡ chữ
 * do người dùng chọn (`fontSizeRem`, nhớ qua localStorage ở
 * `LogViewControls`), còn kẻ phân cách mờ giữa các dòng thì luôn có: nó là
 * thứ giữ cho mắt không trôi sang dòng bên cạnh khi một dòng dài gập xuống.
 *
 * ─── Vì sao không dùng thư viện ảo hoá ───
 *
 * Ảo hoá đúng cách đòi hỏi biết trước chiều cao mỗi hàng, mà một dòng log có
 * thể dài vài trăm ký tự và xuống dòng thành ba hàng. Đo động thì kéo theo một
 * `ResizeObserver` cho mỗi hàng — đắt hơn chính thứ nó định tối ưu.
 *
 * Thay vào đó là `content-visibility: auto` trên từng hàng: trình duyệt tự bỏ
 * qua layout và vẽ của hàng nằm ngoài tầm nhìn, chỉ giữ một chiều cao ước
 * lượng (`contain-intrinsic-size`) để thanh cuộn không nhảy. Với 1500 hàng mà
 * chỉ ~40 hàng đang trong khung, mỗi lô log mới chỉ tốn layout của ~40 hàng ấy.
 *
 * ─── Vì sao hàng là thẻ trần, không phải `Box sx` ───
 *
 * Một app dùng camera in vài trăm dòng mỗi giây. Mỗi lô tới là React duyệt
 * lại 1500 hàng; nếu mỗi hàng là bốn `Box sx` thì đó là 6000 lượt tính style
 * của emotion mỗi 100ms — chính là cái làm tab đứng hình. Style của hàng nằm
 * MỘT lần ở khung ngoài (selector `& .row`, `& [data-level]`), hàng chỉ mang
 * className, và `Row` được `memo` nên hàng cũ không vẽ lại khi có hàng mới.
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
  /** Cỡ chữ người dùng chọn, đơn vị rem — xem `LOG_FONT_SIZES_REM`. */
  fontSizeRem: number
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
  fontSizeRem,
}: LogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const rendered = lines.length > MAX_RENDERED_LINES ? lines.slice(-MAX_RENDERED_LINES) : lines
  const hidden = lines.length - rendered.length

  // Bám theo dòng CUỐI chứ không phải số dòng: khi đệm đã đầy, mỗi lô mới
  // đẩy một lượt dòng cũ ra khỏi cửa sổ 1500 và số dòng đứng yên — bám theo
  // số dòng thì bám đáy lặng lẽ ngừng hoạt động đúng lúc log chảy mạnh nhất.
  const lastSeq = rendered.length === 0 ? -1 : rendered[rendered.length - 1]!.seq

  // `useLayoutEffect` chứ không phải `useEffect`: cuộn phải xảy ra trong cùng
  // khung hình với lần vẽ thêm dòng mới. Chậm một khung là mắt thấy giật.
  useLayoutEffect(() => {
    if (!autoScroll || frozen) return
    const node = containerRef.current
    if (node === null) return
    node.scrollTop = node.scrollHeight
  }, [lastSeq, autoScroll, frozen])

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
        // Gần hết chiều cao còn lại của trang: đầu trang + một hàng nút ở trên
        // chiếm ~150px, và khung này là thứ duy nhất đáng chiếm phần còn lại.
        height: 'clamp(360px, calc(100dvh - 210px), 1200px)',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        border: `1px solid ${m3('outlineVariant')}`,
        borderRadius: `${m3Shape.large}px`,
        backgroundColor: m3('surfaceContainerLowest'),
        fontFamily: MONO_FONT_STACK,
        fontSize: `${String(fontSizeRem)}rem`,
        lineHeight: 1.65,
        py: 0.75,

        '& .row': {
          display: 'flex',
          gap: 3,
          px: 4,
          py: 0.75,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          borderBottom: `1px solid ${m3('surfaceContainerHigh')}`,
          contentVisibility: 'auto',
          // Ước lượng cho một dòng KHÔNG gập: chiều cao thật được nhớ lại sau
          // lần vẽ đầu (`auto`), nên cuộn ngược lên không giật.
          containIntrinsicSize: `auto ${String(fontSizeRem * 1.65 + 0.75)}rem`,
          '&:hover': { backgroundColor: m3('surfaceContainer') },
        },
        '& .row[data-severe]': {
          backgroundColor: m3('errorContainer'),
          '& .message': { color: m3('onErrorContainer') },
        },
        '& .time': { color: m3('outline'), flexShrink: 0 },
        '& .level': { fontWeight: 700, flexShrink: 0, width: '1ch' },
        ...Object.fromEntries(
          (Object.keys(LEVEL_COLOR) as LogLevel[]).map((level) => [
            `& .row[data-level="${level}"] .level`,
            { color: LEVEL_COLOR[level] },
          ]),
        ),
        '& .tag': {
          color: m3('onSurfaceVariant'),
          flexShrink: 0,
          width: '18ch',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '& .message': { color: m3('onSurface'), minWidth: 0 },
        '& mark': {
          borderRadius: '3px',
          backgroundColor: m3('warningContainer'),
          color: m3('onWarningContainer'),
          paddingInline: '2px',
        },
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
              ⋯ {hidden.toLocaleString('vi-VN')} dòng cũ hơn không được vẽ ra. Lọc theo mức, tag hay
              chuỗi để thu hẹp lại.
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

/**
 * `memo`: `line` là bất biến và `searchQuery` chỉ đổi khi gõ, nên giữa hai lô
 * log liên tiếp mọi hàng cũ đều bỏ qua được — chỉ hàng mới được vẽ.
 */
const Row = memo(function Row({ line, searchQuery }: { line: LogcatLine; searchQuery: string }) {
  const severe = line.level === 'E' || line.level === 'F'

  return (
    <div className="row" data-level={line.level} data-severe={severe ? '' : undefined}>
      <span className="time">{line.time}</span>
      <span className="level">{line.level}</span>
      <span className="tag" title={line.tag}>
        {line.tag}
      </span>
      <span className="message">{highlightText(line.message, searchQuery)}</span>
    </div>
  )
})

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
    parts.push(<mark key={`${index}-${end}`}>{text.slice(index, end)}</mark>)
    cursor = end
    index = lowerText.indexOf(lowerNeedle, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.length === 0 ? text : parts
}
