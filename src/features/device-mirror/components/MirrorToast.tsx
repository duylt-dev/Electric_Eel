'use client'

import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { useCallback, useState } from 'react'

import type { DeviceMirrorEffect } from '../DeviceMirrorContract'
import { DeviceMirrorViewModel } from '../DeviceMirrorViewModel'

interface Toast {
  readonly message: string
  readonly severity: 'success' | 'error' | 'info'
}

/**
 * Nơi thu Effect của ViewModel mirror: `ShowMessage` → Snackbar, `DownloadFile`
 * → lưu tệp về máy.
 *
 * Tách khỏi `DeviceMirrorPanel` để MỘT nơi thu là rõ ràng. Kênh Effect chỉ có
 * một người nghe (`EffectChannel`), nên màn nào đã đặt component này thì không được gọi
 * `useEffects` thêm lần nữa — người sau sẽ thay người trước, và Effect bắn
 * trước khi đổi người nghe rơi vào tay handler cũ.
 */
export function MirrorToast() {
  const [toast, setToast] = useState<Toast | null>(null)

  DeviceMirrorViewModel.useEffects(
    useCallback((effect: DeviceMirrorEffect) => {
      switch (effect.type) {
        case 'ShowMessage':
          setToast({ message: effect.message, severity: effect.severity })
          return

        case 'DownloadFile': {
          // Sao vào một `Uint8Array<ArrayBuffer>` MỚI: `effect.bytes` khai kiểu
          // rộng `Uint8Array<ArrayBufferLike>` (có thể là `SharedArrayBuffer`
          // theo lib mới của TS), còn `Blob` chỉ nhận `ArrayBufferView<ArrayBuffer>`.
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(effect.bytes)], { type: effect.mimeType }),
          )
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = effect.fileName
          document.body.append(anchor)
          anchor.click()
          anchor.remove()
          // Thu hồi ở lượt sau: thu hồi ngay thì có trình duyệt huỷ luôn lượt
          // tải vừa bắt đầu.
          setTimeout(() => URL.revokeObjectURL(url), 0)
          return
        }
      }
    }, []),
  )

  return (
    <Snackbar
      open={toast !== null}
      autoHideDuration={6000}
      onClose={() => setToast(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={toast?.severity ?? 'info'}
        onClose={() => setToast(null)}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {toast?.message}
      </Alert>
    </Snackbar>
  )
}
