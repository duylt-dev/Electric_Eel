'use client'

import { AdbLogcatViewModel, adbLogcatDeps } from './AdbLogcatViewModel'
import { AdbLogcatScreen } from './AdbLogcatScreen'
import type { AdbLogcatScreenProps } from './AdbLogcatScreen'

export interface AdbLogcatRootProps extends AdbLogcatScreenProps {
  serial: string
  packageName: string
}

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * `key` đặt ở nơi gọi (trang) chứ không ở đây: đổi app hay đổi máy phải dựng
 * lại ViewModel từ đầu, vì đệm log của app cũ không còn nghĩa gì với app mới.
 *
 * Không có intent khởi động: luồng log mở trong `onStart` của ViewModel, nên
 * nó gắn với vòng đời ViewModel — dispose là luồng đứt, không cần ai dọn tay.
 */
export function AdbLogcatRoot({ serial, packageName, ...screenProps }: AdbLogcatRootProps) {
  return (
    <AdbLogcatViewModel.Provider deps={adbLogcatDeps(serial, packageName)}>
      <AdbLogcatScreen {...screenProps} />
    </AdbLogcatViewModel.Provider>
  )
}
