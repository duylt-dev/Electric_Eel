import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { AppErrors } from '@/core/result'
import { clientContainer } from '@/di/client'
import { autoSelectDevice } from '@/domain/adb/entities/AdbDevice'
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
 *
 * Hai khoá công việc, vì hai vòng đời khác nhau:
 *
 *   `devices`  — luồng theo dõi máy, mở ở `onStart` và sống suốt màn hình.
 *   `packages` — nạp app của máy đang chọn: ngắn, và lượt mới huỷ lượt cũ.
 *
 * Gộp chung một khoá như trước thì bấm chọn máy là luồng theo dõi chết theo,
 * và từ đó cắm cáp không còn ai thấy.
 */
export interface LogcatPickerDeps {
  adb: AdbRepository
}

type Context = IntentContext<LogcatPickerState, LogcatPickerEffect, LogcatPickerIntent>

const DEVICES_KEY = 'devices'
const PACKAGES_KEY = 'packages'

/** Máy đổi thì danh sách app lẫn nhãn của máy cũ đều bỏ — nhãn theo APK, không theo tên. */
const EMPTY_PACKAGES = {
  packageNames: [] as readonly string[],
  packagesStatus: 'idle' as const,
  deviceLabels: {} as Readonly<Record<string, string>>,
  labelsStatus: 'idle' as const,
  labelsMessage: null,
}

/**
 * Theo dõi máy cắm vào máy chủ cho tới khi màn hình rời đi.
 *
 * Mỗi lần danh sách đổi, tự chọn máy như `autoSelectDevice` quy định. Chọn
 * xong KHÔNG nạp app tại đây mà `dispatch` một `DeviceSelected`: việc nạp
 * thuộc khoá `packages`, để người dùng bấm chọn máy khác là lượt nạp cũ bị
 * huỷ — còn luồng này thì không được chết theo cú bấm đó.
 */
async function watch(ctx: Context, deps: LogcatPickerDeps): Promise<void> {
  ctx.setState((state) => ({ ...state, status: 'loading', error: null }))

  const outcome = await deps.adb.watchDevices((event) => {
    if (ctx.signal.aborted) return

    if (event.type === 'failed') {
      ctx.setState((state) => ({ ...state, status: 'failed', error: AppErrors.upstream(event.message) }))
      return
    }

    const previousSerial = ctx.getState().selectedSerial
    const nextSerial = autoSelectDevice(event.devices, previousSerial)

    ctx.setState((state) => ({
      ...state,
      status: 'ready',
      error: null,
      devices: event.devices,
      selectedSerial: nextSerial,
    }))

    // Máy đã đổi thì danh sách app cũ không còn đúng nữa. Giữ lại nó sẽ khiến
    // người dùng bấm vào một app không có trên máy đang chọn.
    if (nextSerial !== previousSerial) ctx.dispatch({ type: 'DeviceSelected', serial: nextSerial })
  }, ctx.signal)
  if (ctx.signal.aborted) return

  // Luồng chỉ kết thúc khi bị huỷ; về tới đây mà chưa huỷ là máy chủ đã đóng
  // nó (deploy lại, mất mạng). Nói ra để có nút mở lại.
  ctx.setState((state) => ({
    ...state,
    status: 'failed',
    error: outcome.ok ? AppErrors.network('Mất kết nối theo dõi thiết bị.') : outcome.error,
  }))
}

async function loadPackages(ctx: Context, deps: LogcatPickerDeps, serial: string): Promise<void> {
  ctx.setState((state) => ({ ...state, packagesStatus: 'loading' }))

  const packages = await deps.adb.listPackages(serial, ctx.signal)
  if (ctx.signal.aborted) return

  if (!packages.ok) {
    ctx.setState((state) => ({ ...state, packagesStatus: 'failed' }))
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

  // Mở luồng theo dõi ngay khi màn hình dựng lên: danh sách thiết bị là thứ
  // người dùng tới đây để xem, và cắm cáp là phải thấy chứ không phải bấm.
  onStart: watch,
  // Luồng mở ở `onStart` phải huỷ được bởi "Thử lại" — cùng khoá `devices`.
  startKey: DEVICES_KEY,

  intentKey: (intent) => {
    switch (intent.type) {
      case 'DevicesRefreshRequested':
        return DEVICES_KEY
      case 'DeviceSelected':
      case 'PackagesRefreshRequested':
        return PACKAGES_KEY
      case 'AppOpened':
        return undefined
    }
  },

  async handleIntent(intent, ctx, deps) {
    switch (intent.type) {
      case 'DevicesRefreshRequested':
        await watch(ctx, deps)
        return

      case 'DeviceSelected': {
        ctx.setState((state) => ({ ...state, selectedSerial: intent.serial, ...EMPTY_PACKAGES }))
        // `null` = không còn máy nào để hỏi. Chỉ cần tới đây: intent cùng khoá
        // đã huỷ lượt nạp đang bay của máy cũ.
        if (intent.serial !== null) await loadPackages(ctx, deps, intent.serial)
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

  onError: (error, intent, ctx) => {
    // Chỉ lỗi của luồng theo dõi mới đỏ khối thiết bị; lỗi nạp app đã có
    // snackbar, và `packagesStatus` đã ghi `failed`.
    if (intent.type === 'DevicesRefreshRequested') {
      ctx.setState((state) => ({ ...state, status: 'failed', error }))
    }
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  createDependencies: (): LogcatPickerDeps => ({ adb: clientContainer.adb }),
})
