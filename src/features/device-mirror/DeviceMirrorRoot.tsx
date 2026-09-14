'use client'

import { useCallback, useEffect, useState } from 'react'

import { clientContainer } from '@/di/client'
import { DeviceMirrorViewModel, deviceMirrorDeps } from './DeviceMirrorViewModel'
import { DeviceMirrorScreen } from './DeviceMirrorScreen'

export interface DeviceMirrorRootProps {
  serial: string
}

/**
 * Gắn ViewModel + sink video vào vòng đời màn hình.
 *
 * Sink KHÔNG nằm trong State (luật §2 của `docs/architecture.md`: State thuần
 * dữ liệu, không giữ `HTMLCanvasElement`/decoder) — nó sống ở đây, ngang hàng
 * với ViewModel. Canvas cũng không đi xuống Screen như một node: Screen chỉ
 * nhận `attachSurface` và gọi nó bằng ref callback của ô hiển thị; sink tự tạo
 * canvas + decoder đúng lúc đó (`WebCodecsVideoSink.attach`).
 *
 * Nhờ sink LƯỜI (hàm dựng không chạm `document`), `useState(() => …)` ở đây
 * an toàn ở cả hai chỗ từng là bẫy:
 *   · SSR — initializer chạy trên máy chủ, nhưng chỉ tạo một object rỗng.
 *   · StrictMode (dev) — initializer bị gọi hai lần; instance bị vứt chưa
 *     `attach` nên không giữ WebGL context hay `VideoDecoder` nào để rò.
 * Gỡ màn hình → `dispose()`; StrictMode gắn lại thì ref callback chạy lại →
 * `attach()` dựng lại từ đầu. Không `setState` trong effect, không màn trắng
 * frame đầu — `PageHeader` có trong HTML máy chủ trả về.
 */
export function DeviceMirrorRoot({ serial }: DeviceMirrorRootProps) {
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
      <DeviceMirrorScreen attachSurface={attachSurface} />
    </DeviceMirrorViewModel.Provider>
  )
}
