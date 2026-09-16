import { type Result, ok } from '../../../core/result'
import type { AdbDevice } from '../../../domain/adb/entities/AdbDevice'
import type { DeviceWatchEvent } from '../../../domain/adb/entities/DeviceWatchEvent'
import type { LogcatEvent, LogcatRequest } from '../../../domain/adb/entities/LogcatSession'
import type { PackageLabelEvent } from '../../../domain/adb/entities/PackageLabelEvent'
import type { AdbRepository } from '../../../domain/adb/repositories/AdbRepository'
import { clearLogcatBuffer, listPackages } from '../../../domain/adb/usecases/adbCommands'
import { createFollowEventBatcher } from '../../../domain/adb/usecases/batchFollowEvents'
import { followAppLogcat } from '../../../domain/adb/usecases/followAppLogcat'
import { WebUsbDeviceHub } from './WebUsbDeviceHub'

/**
 * Hiện thực cổng adb chạy TRỌN TRONG TRÌNH DUYỆT: máy chủ không có vai trò gì.
 *
 * So với `HttpAdbRepository`, mỗi phương thức ở đây gọi thẳng use case với một
 * `TangoAdbShell` — đúng những use case mà Route Handler gọi ở phía máy chủ.
 * Nhờ vậy hai đường cho cùng một hành vi (bám pid qua các lần app khởi động
 * lại, gom dòng theo nhịp), và use case được test một lần cho cả hai.
 *
 * Nhãn app là ngoại lệ: chúng cần `aapt2` — thứ chỉ có trên máy tính có
 * Android SDK. Trong trình duyệt không có, nên luồng nhãn nói `unavailable`
 * ngay; màn hình đã biết cách hiện danh sách không tên.
 */
export class WebUsbAdbRepository implements AdbRepository {
  readonly access = 'webusb' as const
  readonly #hub: WebUsbDeviceHub

  constructor(hub: WebUsbDeviceHub = new WebUsbDeviceHub()) {
    this.#hub = hub
  }

  requestDevice(): Promise<Result<AdbDevice | null>> {
    return this.#hub.requestDevice()
  }

  async listDevices(): Promise<Result<AdbDevice[]>> {
    return ok(this.#hub.snapshot())
  }

  watchDevices(onEvent: (event: DeviceWatchEvent) => void, signal: AbortSignal): Promise<Result<void>> {
    return this.#hub.watch(onEvent, signal)
  }

  async listPackages(serial: string, signal?: AbortSignal): Promise<Result<string[]>> {
    const shell = await this.#hub.shellReady(serial, signal)
    if (!shell.ok) return shell
    return listPackages(shell.value, serial, signal)
  }

  async streamPackageLabels(
    _serial: string,
    onEvent: (event: PackageLabelEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    if (signal.aborted) return ok(undefined)
    onEvent({
      type: 'unavailable',
      message: 'Nối qua trình duyệt thì không đọc được tên app từ APK; danh sách hiện package name.',
    })
    onEvent({ type: 'done' })
    return ok(undefined)
  }

  async clearBuffer(serial: string, signal?: AbortSignal): Promise<Result<void>> {
    const shell = await this.#hub.shellReady(serial, signal)
    if (!shell.ok) return shell
    return clearLogcatBuffer(shell.value, serial, signal)
  }

  async streamLogcat(
    request: LogcatRequest,
    onEvent: (event: LogcatEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    const shell = await this.#hub.shellReady(request.serial, signal)
    if (!shell.ok) return shell

    const batcher = createFollowEventBatcher(onEvent)
    const outcome = await followAppLogcat(
      { shell: shell.value },
      { serial: request.serial, packageName: request.packageName, clearFirst: request.clearFirst === true },
      batcher.emit,
      signal,
    )
    batcher.stop()
    return outcome
  }
}
