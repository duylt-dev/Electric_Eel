'use client'

import { LogcatPickerViewModel } from './LogcatPickerViewModel'
import { LogcatPickerScreen } from './LogcatPickerScreen'
import type { LogcatPickerScreenProps } from './LogcatPickerScreen'

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * Tách khỏi `LogcatPickerScreen` vì hook của ViewModel chỉ dùng được bên trong
 * Provider của chính nó. Không có intent khởi động ở đây: việc hỏi adb nằm
 * trong `onStart` của ViewModel, nên nó chạy đúng một lần theo vòng đời
 * ViewModel chứ không theo vòng đời một effect trong component.
 */
export function LogcatPickerRoot(props: LogcatPickerScreenProps) {
  return (
    <LogcatPickerViewModel.Provider>
      <LogcatPickerScreen {...props} />
    </LogcatPickerViewModel.Provider>
  )
}
