import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { autoSelectDevice, isUsable } from '@/domain/adb/entities/AdbDevice'
import type { AdbRepository } from '@/domain/adb/repositories/AdbRepository'
import { initialMirrorPickerState } from './MirrorPickerContract'
import type {
  MirrorPickerEffect,
  MirrorPickerIntent,
  MirrorPickerState,
} from './MirrorPickerContract'

/**
 * ViewModel của màn chọn thiết bị để mở Màn hình máy.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Điều hướng sang màn mirror là một Effect, không phải `router.push`.
 */
export interface MirrorPickerDeps {
  adb: AdbRepository
}

type Context = IntentContext<MirrorPickerState, MirrorPickerEffect>

async function loadDevices(ctx: Context, deps: MirrorPickerDeps, announce: boolean): Promise<void> {
  ctx.setState((state) => ({ ...state, status: 'loading', error: null }))

  const devices = await deps.adb.listDevices(ctx.signal)
  if (ctx.signal.aborted) return

  if (!devices.ok) {
    ctx.setState((state) => ({ ...state, status: 'failed', error: devices.error }))
    return
  }

  const previousSerial = ctx.getState().selectedSerial
  const nextSerial = autoSelectDevice(devices.value, previousSerial)

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    devices: devices.value,
    selectedSerial: nextSerial,
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
}

export const MirrorPickerViewModel = defineViewModel<
  MirrorPickerState,
  MirrorPickerIntent,
  MirrorPickerEffect,
  MirrorPickerDeps
>({
  name: 'MirrorPicker',

  initialState: () => initialMirrorPickerState,

  // Hỏi adb ngay khi màn hình dựng lên: danh sách thiết bị là thứ người dùng
  // tới đây để xem, không phải thứ họ phải bấm mới thấy.
  onStart: (ctx, deps) => loadDevices(ctx, deps, false),
  // Bấm "Làm mới" trong lúc lượt nạp đầu còn bay thì lượt đầu bị huỷ, không chạy đua.
  startKey: 'adb',

  /**
   * Mọi intent dùng CHUNG một khoá 'adb'.
   *
   * Kể cả `MirrorOpened` — nó chạy đồng bộ (đọc `selectedSerial` hiện có rồi
   * emit ngay), và vì cùng khoá nên nó HUỶ một lượt "Làm mới" đang bay. Đó là
   * điều muốn có: người dùng đã chọn máy và đi sang màn mirror, danh sách
   * đang tải lại phía sau không còn ai xem, huỷ sớm còn hơn để nó `setState`
   * vào một màn sắp bị gỡ.
   */
  intentKey: () => 'adb',

  async handleIntent(intent, ctx, deps) {
    switch (intent.type) {
      case 'DevicesRefreshRequested':
        await loadDevices(ctx, deps, true)
        return

      case 'DeviceSelected':
        ctx.setState((state) => ({ ...state, selectedSerial: intent.serial }))
        return

      case 'MirrorOpened': {
        const serial = ctx.getState().selectedSerial
        if (serial === null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chọn thiết bị trước đã.' })
          return
        }
        ctx.emit({ type: 'OpenMirror', serial })
        return
      }
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  createDependencies: (): MirrorPickerDeps => ({ adb: clientContainer.adb }),
})
