'use client'

import { useCallback, useEffect, useState } from 'react'

import { clientContainer } from '@/di/client'
import { DeviceMirrorPanel } from './DeviceMirrorPanel'
import { DeviceMirrorViewModel, deviceMirrorDeps } from './DeviceMirrorViewModel'

export interface DeviceMirrorRootProps {
  serial: string
  /**
   * Người dùng bấm đóng ô. Chủ ô (màn logcat) đáp lại bằng cách GỠ Root khỏi
   * cây — đó là cách duy nhất để luồng đứt và scrcpy-server trên máy dừng.
   */
  onClose: () => void
}

/**
 * Gắn ViewModel + sink video vào vòng đời ô mirror.
 *
 * Mirror chỉ còn một lớp vỏ: ô nhúng cạnh log (`DeviceMirrorPanel`). Trang
 * riêng `/mirror/[serial]` với ô chọn chất lượng đã bỏ — chất lượng cố định ở
 * mức cao nhất (`MIRROR_QUALITY`), không còn gì để chọn.
 *
 * Sink KHÔNG nằm trong State (luật §2 của `docs/architecture.md`: State thuần
 * dữ liệu, không giữ `HTMLCanvasElement`/decoder) — nó sống ở đây, ngang hàng
 * với ViewModel. Canvas cũng không đi xuống Panel như một node: Panel chỉ
 * nhận `attachSurface` và gọi nó bằng ref callback của ô hiển thị; sink tự tạo
 * canvas + decoder đúng lúc đó (`WebCodecsVideoSink.attach`).
 *
 * Nhờ sink LƯỜI (hàm dựng không chạm `document`), `useState(() => …)` ở đây
 * an toàn ở cả hai chỗ từng là bẫy:
 *   · SSR — initializer chạy trên máy chủ, nhưng chỉ tạo một object rỗng.
 *   · StrictMode (dev) — initializer bị gọi hai lần; instance bị vứt chưa
 *     `attach` nên không giữ WebGL context hay `VideoDecoder` nào để rò.
 * Gỡ ô → `dispose()`; StrictMode gắn lại thì ref callback chạy lại →
 * `attach()` dựng lại từ đầu. Không `setState` trong effect.
 *
 * Root này render lại mỗi khi cha render lại (ở màn logcat là mỗi lô log) —
 * vô hại: Provider cố ý bỏ qua thay đổi tham chiếu `deps`, và `attachSurface`
 * giữ nguyên danh tính nên ref callback không chạy lại.
 */
export function DeviceMirrorRoot({ serial, onClose }: DeviceMirrorRootProps) {
  const [sink] = useState(() => clientContainer.deviceMirror.createVideoSink())

  useEffect(() => () => sink.dispose(), [sink])

  const attachSurface = useCallback(
    (container: HTMLDivElement | null) => {
      if (container !== null) sink.attach(container)
    },
    [sink],
  )

  return (
    <DeviceMirrorViewModel.Provider deps={deviceMirrorDeps(serial, sink)}>
      <DeviceMirrorPanel attachSurface={attachSurface} onClose={onClose} />
    </DeviceMirrorViewModel.Provider>
  )
}
