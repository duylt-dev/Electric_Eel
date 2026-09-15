'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useCallback, useRef } from 'react'

import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import type { MirrorStatus } from '../DeviceMirrorContract'
import { useMirrorPointer } from './useMirrorPointer'
import type { MirrorPointerHandlers } from './useMirrorPointer'

export interface MirrorSurfaceProps extends MirrorPointerHandlers {
  /**
   * Ref callback của ô chứa canvas — Root nối thẳng vào `sink.attach()`. Sink
   * tự tạo canvas và `appendChild` vào ô này; React không biết gì về canvas.
   */
  attach: (container: HTMLDivElement | null) => void
  status: MirrorStatus
  /** Đang chảy + đã bật điều khiển + có phiên (`canControl(state)`): nhận chuột/chạm, đổi con trỏ. */
  controllable: boolean
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
 * Sự kiện chuột/chạm gắn lên chính div chứa (xem `useMirrorPointer`); toạ độ
 * quy về rect của canvas bên trong, nên bấm vào phần đệm quanh canvas (nếu
 * có) vẫn ra điểm ở mép.
 *
 * ─── Tỉ lệ khung hình ───
 * Không cần `aspect-ratio` hay biết `frameSize`: renderer của Tango đặt
 * `canvas.width/height` theo khung hình thật (`CanvasVideoFrameRenderer.setSize`),
 * nên canvas có KÍCH CỠ NỘI TẠI như một `<img>`. Chỉ cần `max-width`/`max-height`
 * + `width/height: auto` là trình duyệt tự thu theo đúng tỉ lệ, kể cả khi máy
 * xoay giữa chừng — không có đường nào làm hình bị méo.
 */
export function MirrorSurface({ attach, status, controllable, onTouch, onScroll, onKey }: MirrorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pointer = useMirrorPointer(containerRef, controllable, { onTouch, onScroll, onKey })

  // Một ref callback ổn định cho cả sink lẫn hook: đổi danh tính mỗi render
  // là React gọi lại `attach(node)` mỗi render → sink dựng lại canvas.
  const bindContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      attach(node)
    },
    [attach],
  )

  return (
    <Box sx={{ position: 'relative', width: 'fit-content', maxWidth: '100%' }}>
      <Box
        ref={bindContainer}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerCancel}
        onContextMenu={pointer.onContextMenu}
        sx={{
          // Ô rỗng (chưa có khung hình) vẫn phải có hình hài để lớp phủ
          // "Đang nối…" có chỗ đứng — kích cỡ một màn điện thoại dọc thu nhỏ.
          minWidth: 180,
          minHeight: 320,
          backgroundColor: m3('surfaceContainerLowest'),
          borderRadius: `${m3Shape.large}px`,
          overflow: 'hidden',
          cursor: controllable ? 'crosshair' : 'default',
          // Trình duyệt không được tự cuộn/zoom trang khi người dùng vuốt trên
          // canvas — cử chỉ đó là của máy Android.
          touchAction: 'none',
          userSelect: 'none',
          '& canvas': {
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            // Đầu trang + chọn chất lượng + hàng nút + ô gõ chữ bên dưới ≈ 340px.
            maxHeight: 'calc(100dvh - 340px)',
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
