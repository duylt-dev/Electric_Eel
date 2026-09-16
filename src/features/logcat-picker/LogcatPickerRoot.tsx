'use client'

import type { AdbAccess } from '@/domain/adb/entities/AdbAccess'
import { LogcatPickerViewModel, logcatPickerDeps } from './LogcatPickerViewModel'
import { LogcatPickerScreen } from './LogcatPickerScreen'
import type { LogcatPickerScreenProps } from './LogcatPickerScreen'

export interface LogcatPickerRootProps extends LogcatPickerScreenProps {
  /** Trang tính từ `ADB_ENABLED`; xem `AdbAccess`. */
  access: AdbAccess
}

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * Tách khỏi `LogcatPickerScreen` vì hook của ViewModel chỉ dùng được bên trong
 * Provider của chính nó. Không có intent khởi động ở đây: việc hỏi adb nằm
 * trong `onStart` của ViewModel, nên nó chạy đúng một lần theo vòng đời
 * ViewModel chứ không theo vòng đời một effect trong component.
 */
export function LogcatPickerRoot({ access, ...screenProps }: LogcatPickerRootProps) {
  return (
    <LogcatPickerViewModel.Provider deps={logcatPickerDeps(access)}>
      <LogcatPickerScreen {...screenProps} access={access} />
    </LogcatPickerViewModel.Provider>
  )
}
