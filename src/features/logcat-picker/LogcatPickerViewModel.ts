import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { autoSelectDevice, isUsable } from '@/domain/adb/entities/AdbDevice'
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

/** Máy đổi thì danh sách app lẫn nhãn của máy cũ đều bỏ — nhãn theo APK, không theo tên. */
const EMPTY_PACKAGES = {
  packageNames: [] as readonly string[],
  packagesStatus: 'idle' as const,
  deviceLabels: {} as Readonly<Record<string, string>>,
  labelsStatus: 'idle' as const,
  labelsMessage: null,
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
  const nextSerial = autoSelectDevice(devices.value, previousSerial)
  const changed = nextSerial !== previousSerial

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    devices: devices.value,
    selectedSerial: nextSerial,
    // Máy đã đổi thì danh sách app cũ không còn đúng nữa. Giữ lại nó sẽ khiến
    // người dùng bấm vào một app không có trên máy đang chọn.
    ...(changed ? { ...EMPTY_PACKAGES } : {}),
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

  await loadLabels(ctx, deps, serial)
}

/**
 * Điền tên app vào danh sách vừa có, từng cái một khi máy chủ đọc xong.
 *
 * Chạy TRONG cùng intent với `loadPackages` và dùng cùng `ctx.signal`: đổi
 * máy hay bấm làm mới là luồng này bị huỷ theo, không cần job riêng để dọn.
 * Lỗi ở đây không đỏ màn hình — danh sách đã có, chỉ thiếu tên — nên chỉ ghi
 * `labelsMessage` để màn hình nhắc một dòng.
 */
async function loadLabels(ctx: Context, deps: LogcatPickerDeps, serial: string): Promise<void> {
  ctx.setState((state) => ({ ...state, labelsStatus: 'loading', labelsMessage: null }))

  const outcome = await deps.adb.streamPackageLabels(
    serial,
    (event) => {
      if (ctx.signal.aborted) return
      if (event.type === 'label') {
        ctx.setState((state) => ({
          ...state,
          deviceLabels: { ...state.deviceLabels, [event.packageName]: event.label },
        }))
      } else if (event.type === 'unavailable') {
        ctx.setState((state) => ({ ...state, labelsStatus: 'unavailable', labelsMessage: event.message }))
      }
    },
    ctx.signal,
  )
  if (ctx.signal.aborted) return

  ctx.setState((state) =>
    outcome.ok
      ? { ...state, labelsStatus: state.labelsStatus === 'unavailable' ? 'unavailable' : 'ready' }
      : { ...state, labelsStatus: 'unavailable', labelsMessage: outcome.error.message },
  )
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
  // Bấm "Làm mới" trong lúc lượt nạp đầu còn bay thì lượt đầu bị huỷ, không chạy đua.
  startKey: 'adb',

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
        ctx.setState((state) => ({ ...state, selectedSerial: intent.serial, ...EMPTY_PACKAGES }))
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
