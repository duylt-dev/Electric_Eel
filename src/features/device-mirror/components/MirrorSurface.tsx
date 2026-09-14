'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import type { MirrorStatus } from '../DeviceMirrorContract'

export interface MirrorSurfaceProps {
  /**
   * Ref callback của ô chứa canvas — Root nối thẳng vào `sink.attach()`. Sink
   * tự tạo canvas và `appendChild` vào ô này; React không biết gì về canvas.
   */
  attach: (container: HTMLDivElement | null) => void
  /** Đang mở/chảy luồng — dùng để đổi con trỏ, báo trước chỗ phase 06 gắn pointer handler. */
  live: boolean
  status: MirrorStatus
}

/**
 * Ô hiển thị hình máy.
 *
 * Canvas KHÔNG phải con React: sink tạo nó một lần và WebGL renderer vẽ trực
 * tiếp lên nó ngoài vòng render của React — 60 lần/giây lúc video chảy. Nếu
 * để nó là JSX, mỗi lần Screen render lại là một dịp React so cây và có thể
 * tháo/dựng lại canvas, xoá luôn context WebGL đang chạy. Vì vậy `div` chứa
 * canvas không render con React nào — React chỉ biết "div này có 0 con do nó
 * quản lý" và không đụng vào bên trong. Lớp phủ "Đang nối…" là một `div` ANH
 * EM tuyệt đối, không phải con của div chứa canvas.
 *
 * ─── Tỉ lệ khung hình ───
 * Không cần `aspect-ratio` hay biết `frameSize`: renderer của Tango đặt
 * `canvas.width/height` theo khung hình thật (`CanvasVideoFrameRenderer.setSize`),
 * nên canvas có KÍCH CỠ NỘI TẠI như một `<img>`. Chỉ cần `max-width`/`max-height`
 * + `width/height: auto` là trình duyệt tự thu theo đúng tỉ lệ, kể cả khi máy
 * xoay giữa chừng — không có đường nào làm hình bị méo.
 */
export function MirrorSurface({ attach, live, status }: MirrorSurfaceProps) {
  return (
    <Box sx={{ position: 'relative', width: 'fit-content', maxWidth: '100%' }}>
      <Box
        ref={attach}
        sx={{
          // Ô rỗng (chưa có khung hình) vẫn phải có hình hài để lớp phủ
          // "Đang nối…" có chỗ đứng — kích cỡ một màn điện thoại dọc thu nhỏ.
          minWidth: 180,
          minHeight: 320,
          backgroundColor: m3('surfaceContainerLowest'),
          borderRadius: `${m3Shape.large}px`,
          overflow: 'hidden',
          // Con trỏ đổi hình khi luồng đang chảy: báo trước rằng vùng này sẽ
          // nhận thao tác chuột/chạm — phase 06 gắn pointer handler lên chính
          // canvas (`onPointerDown/Move/Up` + `onWheel`) và lấy toạ độ chuẩn
          // hoá từ `canvas.getBoundingClientRect()`.
          cursor: live ? 'crosshair' : 'default',
          '& canvas': {
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 'calc(100dvh - 240px)',
          },
        }}
      />

      {status === 'connecting' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `color-mix(in srgb, ${m3('scrim')} 35%, transparent)`,
            borderRadius: `${m3Shape.large}px`,
            pointerEvents: 'none',
          }}
        >
          <Typography variant="body2" sx={{ color: m3('inverseOnSurface') }}>
            Đang nối…
          </Typography>
        </Box>
      )}
    </Box>
  )
}
