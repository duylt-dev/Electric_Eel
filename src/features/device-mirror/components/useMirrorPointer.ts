import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'

import type { MirrorKey, MirrorTouchAction } from '@/domain/device-mirror/entities/MirrorControlMessage'
import { normalizePointer, wheelToScroll } from '../pointerToTouch'

export interface MirrorPointerHandlers {
  onTouch: (action: MirrorTouchAction, pointer: number, nx: number, ny: number) => void
  onScroll: (nx: number, ny: number, dx: number, dy: number) => void
  onKey: (key: MirrorKey) => void
}

/** Android nhận tối đa 10 ngón; chuột luôn là ngón 0. */
const MAX_POINTERS = 10
const MOUSE_BUTTON_LEFT = 0
const MOUSE_BUTTON_MIDDLE = 1
const MOUSE_BUTTON_RIGHT = 2

/**
 * Nối sự kiện con trỏ/bánh lăn trên ô canvas thành các callback chạm/cuộn/phím.
 *
 * Theo mẫu scrcpy desktop: chuột trái = chạm, chuột phải = Back, chuột giữa =
 * Home, lăn = cuộn. Trạng thái "ngón nào đang giữ" là UI thuần, giữ trong
 * `useRef` (không phải State của ViewModel — `docs/architecture.md` §2).
 *
 * ─── Ba chỗ dễ sai ───
 *
 * 1. `pointerId` của trình duyệt là số lớn, scrcpy cần id nhỏ ổn định → bảng
 *    `Map<pointerId, 0..9>`, cấp ô trống thấp nhất lúc `down`, trả lại lúc
 *    `up`/`cancel`. Chuột cố định ô 0.
 * 2. `setPointerCapture` ở `down`: kéo ra ngoài canvas vẫn nhận `move`/`up`,
 *    nên không phải gửi `up` giả ở `pointerleave` — cú vuốt mạnh ra mép vẫn
 *    kết thúc đúng chỗ. Chỉ `pointercancel`, tab mất focus và gỡ component mới
 *    phải tự "nhả" mọi ngón đang giữ — không thì máy kẹt ở trạng thái đang chạm.
 * 3. `wheel` gắn bằng `addEventListener({ passive: false })`, không qua
 *    `onWheel` của React: React 17+ đăng ký wheel là passive nên
 *    `preventDefault` trong `onWheel` bị bỏ qua và trang cuộn theo.
 *
 * Toạ độ lấy theo rect của CANVAS (con do sink tạo), không phải của ô chứa:
 * ô chứa có `minWidth/minHeight` lớn hơn canvas lúc khung nhỏ.
 *
 * `handlers` phải ổn định danh tính (`useCallback` ở `MirrorStage`): chúng
 * nằm trong deps của listener native, đổi mỗi render là gắn lại listener mỗi
 * khung `size`/`meta`.
 */
export function useMirrorPointer(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  { onTouch, onScroll, onKey }: MirrorPointerHandlers,
) {
  const slots = useRef(new Map<number, number>())

  const canvasRect = useCallback((): DOMRect | null => {
    const canvas = containerRef.current?.querySelector('canvas')
    return canvas === null || canvas === undefined ? null : canvas.getBoundingClientRect()
  }, [containerRef])

  const releaseAll = useCallback(() => {
    for (const slot of slots.current.values()) onTouch('up', slot, 0, 0)
    slots.current.clear()
  }, [onTouch])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (event.pointerType === 'mouse' && event.button === MOUSE_BUTTON_RIGHT) {
        onKey('back')
        return
      }
      if (event.pointerType === 'mouse' && event.button === MOUSE_BUTTON_MIDDLE) {
        event.preventDefault()
        onKey('home')
        return
      }
      if (event.pointerType === 'mouse' && event.button !== MOUSE_BUTTON_LEFT) return

      const rect = canvasRect()
      if (rect === null) return

      const slot = event.pointerType === 'mouse' ? 0 : lowestFreeSlot(slots.current)
      if (slot === null) return
      slots.current.set(event.pointerId, slot)
      event.currentTarget.setPointerCapture(event.pointerId)

      const { nx, ny } = normalizePointer(event, rect)
      onTouch('down', slot, nx, ny)
    },
    [enabled, canvasRect, onTouch, onKey],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const slot = slots.current.get(event.pointerId)
      if (slot === undefined) return
      const rect = canvasRect()
      if (rect === null) return
      const { nx, ny } = normalizePointer(event, rect)
      onTouch('move', slot, nx, ny)
    },
    [canvasRect, onTouch],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const slot = slots.current.get(event.pointerId)
      if (slot === undefined) return
      slots.current.delete(event.pointerId)
      const rect = canvasRect()
      const { nx, ny } = rect === null ? { nx: 0, ny: 0 } : normalizePointer(event, rect)
      onTouch('up', slot, nx, ny)
    },
    [canvasRect, onTouch],
  )

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // Chuột phải đã thành Back ở `pointerdown`; menu của trình duyệt không được hiện.
    event.preventDefault()
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (node === null) return

    const onWheel = (event: WheelEvent): void => {
      if (!enabled) return
      event.preventDefault()
      const rect = canvasRect()
      if (rect === null) return
      const { nx, ny } = normalizePointer(event, rect)
      const { dx, dy } = wheelToScroll(event.deltaX, event.deltaY)
      if (dx === 0 && dy === 0) return
      onScroll(nx, ny, dx, dy)
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('blur', releaseAll)
    return () => {
      node.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [containerRef, enabled, canvasRect, onScroll, releaseAll])

  // Tắt điều khiển giữa lúc đang giữ chuột: nhả hết, đừng để máy kẹt.
  useEffect(() => {
    if (!enabled) releaseAll()
  }, [enabled, releaseAll])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onContextMenu }
}

function lowestFreeSlot(taken: Map<number, number>): number | null {
  const used = new Set(taken.values())
  for (let slot = 0; slot < MAX_POINTERS; slot += 1) {
    if (!used.has(slot)) return slot
  }
  return null
}
