'use client'

import { MirrorPickerViewModel } from './MirrorPickerViewModel'
import { MirrorPickerScreen } from './MirrorPickerScreen'

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * Tách khỏi `MirrorPickerScreen` vì hook của ViewModel chỉ dùng được bên trong
 * Provider của chính nó. Không có intent khởi động ở đây: việc hỏi adb nằm
 * trong `onStart` của ViewModel.
 */
export function MirrorPickerRoot() {
  return (
    <MirrorPickerViewModel.Provider>
      <MirrorPickerScreen />
    </MirrorPickerViewModel.Provider>
  )
}
