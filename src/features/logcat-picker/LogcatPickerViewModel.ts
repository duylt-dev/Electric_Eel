import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { isUsable } from '@/domain/adb/entities/AdbDevice'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'
import { isSafePackageName } from '@/domain/adb/entities/AndroidPackage'
import type { AdbRepository } from '@/domain/adb/repositories/AdbRepository'
import { initialLogcatPickerState } from './LogcatPickerContract'
import type {
  LogcatPickerEffect,
  LogcatPickerIntent,
  LogcatPickerState,
} from './LogcatPickerContract'

/**
 * ViewModel của màn chọn thiết bị và app.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Điều hướng sang màn log là một Effect, không phải `router.push`.
 */
export interface LogcatPickerDeps {
  adb: AdbRepository
}

type Context = IntentContext<LogcatPickerState, LogcatPickerEffect>

/**
 * Chọn sẵn một máy khi chỉ có đúng một máy dùng được.
 *
 * Gần như lúc nào cũng chỉ có một máy cắm vào, và bắt người ta bấm chọn cái
 * duy nhất trong danh sách là bắt một thao tác không mang thông tin nào. Khi
 * có từ hai máy trở lên thì không đoán: chọn nhầm máy nghĩa là đọc log của một
 * bản build khác, và điều đó rất khó nhận ra.
 */
function autoSelect(devices: readonly AdbDevice[], current: string | null): string | null {
  if (current !== null && devices.some((device) => device.serial === current && isUsable(device))) {
    return current
  }
  const usable = devices.filter(isUsable)
  return usable.length === 1 ? (usable[0]?.serial ?? null) : null
}

async function loadDevices(ctx: Context, deps: LogcatPickerDeps, announce: boolean): Promise<void> {
  ctx.setState((state) => ({ ...state, status: 'loading', error: null }))

  const devices = await deps.adb.listDevices(ctx.signal)
  if (ctx.signal.aborted) return

  if (!devices.ok) {
    ctx.setState((state) => ({ ...state, status: 'failed', error: devices.error }))
    return
  }

  const previousSerial = ctx.getState().selectedSerial
  const nextSerial = autoSelect(devices.value, previousSerial)
  const changed = nextSerial !== previousSerial

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    devices: devices.value,
    selectedSerial: nextSerial,
    // Máy đã đổi thì danh sách app cũ không còn đúng nữa. Giữ lại nó sẽ khiến
    // người dùng bấm vào một app không có trên máy đang chọn.
    ...(changed ? { packageNames: [], packagesStatus: 'idle' as const } : {}),
  }))

  if (announce) {
    const usable = devices.value.filter(isUsable).length
    ctx.emit({
      type: 'ShowMessage',
      severity: usable === 0 ? 'info' : 'success',
      message:
        usable === 0
          ? 'Không thấy thiết bị nào. Cắm máy qua USB và bật gỡ lỗi USB.'
          : `Thấy ${usable} thiết bị sẵn sàng.`,
    })
  }

  // Chỉ nạp app khi chưa có gì để hiện. Bấm làm mới thiết bị không phải là bấm
  // làm mới danh sách app — hai việc có nút riêng vì chúng tốn khác nhau.
  if (nextSerial !== null && ctx.getState().packagesStatus === 'idle') {
    await loadPackages(ctx, deps, nextSerial)
  }
}

async function loadPackages(ctx: Context, deps: LogcatPickerDeps, serial: string): Promise<void> {
  ctx.setState((state) => ({ ...state, packagesStatus: 'loading', error: null }))

  const packages = await deps.adb.listPackages(serial, ctx.signal)
  if (ctx.signal.aborted) return

  if (!packages.ok) {
    ctx.setState((state) => ({ ...state, packagesStatus: 'failed', error: packages.error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: packages.error.message })
    return
  }

  ctx.setState((state) => ({
    ...state,
    packagesStatus: 'ready',
    packageNames: packages.value,
  }))
}

export const LogcatPickerViewModel = defineViewModel<
  LogcatPickerState,
  LogcatPickerIntent,
  LogcatPickerEffect,
  LogcatPickerDeps
>({
  name: 'LogcatPicker',

  initialState: () => initialLogcatPickerState,

  // Hỏi adb ngay khi màn hình dựng lên: danh sách thiết bị là thứ người dùng
  // tới đây để xem, không phải thứ họ phải bấm mới thấy.
  onStart: (ctx, deps) => loadDevices(ctx, deps, false),

  /**
   * Mọi lượt hỏi adb dùng CHUNG một khoá.
   *
   * Chúng đọc và ghi cùng một vùng state (danh sách thiết bị, danh sách app),
   * nên hai lượt chạy song song sẽ ghi đè lẫn nhau theo thứ tự về đích chứ
   * không theo thứ tự bấm. Dùng chung khoá thì lượt mới huỷ lượt cũ, và thứ
   * hiển thị luôn là kết quả của thao tác cuối cùng.
   */
  intentKey: (intent) => (intent.type === 'AppOpened' ? undefined : 'adb'),

  async handleIntent(intent, ctx, deps) {
    switch (intent.type) {
      case 'DevicesRefreshRequested':
        await loadDevices(ctx, deps, true)
        return

      case 'DeviceSelected': {
        ctx.setState((state) => ({
          ...state,
          selectedSerial: intent.serial,
          packageNames: [],
          packagesStatus: 'idle',
        }))
        await loadPackages(ctx, deps, intent.serial)
        return
      }

      case 'PackagesRefreshRequested': {
        const serial = ctx.getState().selectedSerial
        if (serial === null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chưa chọn thiết bị nào.' })
          return
        }
        await loadPackages(ctx, deps, serial)
        return
      }

      case 'AppOpened': {
        // Đây là nhánh cho app trong danh bạ chưa ai điền applicationId. Nói
        // rõ phải đi đâu để sửa, đừng chỉ nói "không mở được".
        if (intent.packageName === null || !isSafePackageName(intent.packageName)) {
          ctx.emit({
            type: 'ShowMessage',
            severity: 'error',
            message: `“${intent.label}” chưa có package name nên không lọc log được. Vào Quản trị → app này → điền applicationId rồi quay lại.`,
          })
          return
        }

        const serial = ctx.getState().selectedSerial
        if (serial === null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chọn thiết bị trước đã.' })
          return
        }

        ctx.emit({ type: 'OpenLogcat', serial, packageName: intent.packageName })
        return
      }
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  createDependencies: (): LogcatPickerDeps => ({ adb: clientContainer.adb }),
})
