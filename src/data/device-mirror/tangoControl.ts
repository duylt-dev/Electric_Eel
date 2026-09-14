// Không `import 'server-only'` ở đây — CỐ Ý: file này thuần quy đổi thông điệp
// → lời gọi writer, không chạm `node:*`, và cần chạy được trong `node:test`
// (`tangoControl.test.ts`). Hai người gọi duy nhất (`tangoSession.ts`,
// `TangoMirrorGateway.ts`) đều mang `server-only`, nên nó vẫn không bao giờ
// lọt vào bundle trình duyệt qua đường DI.
import {
  AndroidKeyEventAction,
  AndroidMotionEventAction,
  AndroidScreenPowerMode,
  type AndroidKeyCode,
  type ScrcpyControlMessageWriter,
} from '@yume-chan/scrcpy'

import { AppErrors, type Result, err, ok, toAppError } from '../../core/result'
import { MIRROR_KEYCODES, type MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import { isAsciiText, toDevicePoint, type DeviceSize } from '../../domain/device-mirror/entities/touchMapping'

const TOUCH_ACTION: Record<'down' | 'up' | 'move', AndroidMotionEventAction> = {
  down: AndroidMotionEventAction.Down,
  up: AndroidMotionEventAction.Up,
  move: AndroidMotionEventAction.Move,
}

const CONTROL_FAILED = 'Không gửi được thao tác điều khiển tới máy.'

const KEY_ACTION: Record<'down' | 'up', AndroidKeyEventAction> = {
  down: AndroidKeyEventAction.Down,
  up: AndroidKeyEventAction.Up,
}

async function sendOne(
  writer: ScrcpyControlMessageWriter,
  size: () => DeviceSize,
  message: MirrorControlMessage,
): Promise<void> {
  switch (message.type) {
    case 'touch': {
      const point = toDevicePoint({ nx: message.nx, ny: message.ny }, size())
      const { width, height } = size()
      await writer.injectTouch({
        action: TOUCH_ACTION[message.action],
        pointerId: BigInt(message.pointer),
        pointerX: point.x,
        pointerY: point.y,
        videoWidth: width,
        videoHeight: height,
        // Nhả tay thì lực chạm về 0 bất kể trình duyệt gửi gì — Android không
        // hiểu "nhả tay với lực khác 0".
        pressure: message.action === 'up' ? 0 : message.pressure,
        actionButton: 0,
        buttons: message.action === 'up' ? 0 : 1,
      })
      return
    }
    case 'scroll': {
      const point = toDevicePoint({ nx: message.nx, ny: message.ny }, size())
      const { width, height } = size()
      await writer.injectScroll({
        pointerX: point.x,
        pointerY: point.y,
        videoWidth: width,
        videoHeight: height,
        scrollX: message.dx,
        scrollY: message.dy,
        buttons: 0,
      })
      return
    }
    case 'key': {
      await writer.injectKeyCode({
        action: KEY_ACTION[message.action],
        keyCode: MIRROR_KEYCODES[message.key] as AndroidKeyCode,
        repeat: 0,
        metaState: 0,
      })
      return
    }
    case 'text': {
      // scrcpy `injectText` chỉ hiểu ASCII. Chữ có dấu đi đường dán clipboard
      // MỘT CHIỀU host→máy (quyết định #4, plan.md) — không phải đồng bộ hai
      // chiều, `sequence: 0n` vì không cần theo dõi ACK của lượt dán này.
      if (isAsciiText(message.text)) {
        await writer.injectText(message.text)
        return
      }
      await writer.setClipboard({ sequence: 0n, paste: true, content: message.text })
      return
    }
    case 'backOrScreenOn': {
      await writer.backOrScreenOn(KEY_ACTION[message.action])
      return
    }
    case 'displayPower': {
      await writer.setScreenPowerMode(message.on ? AndroidScreenPowerMode.Normal : AndroidScreenPowerMode.Off)
      return
    }
    case 'rotate': {
      await writer.rotateDevice()
      return
    }
    case 'expandNotifications': {
      await writer.expandNotificationPanel()
      return
    }
  }
}

/**
 * Gửi một lô thông điệp điều khiển ĐÃ QUA `validateControlBatch` xuống máy.
 *
 * Gửi TUẦN TỰ, không `Promise.all`: Android xử lý sự kiện chạm/phím đúng theo
 * thứ tự nhận được ở tầng input, gửi song song có thể khiến down/up tới máy
 * sai thứ tự dù trình duyệt phát đúng thứ tự lên `ControlOutbox`.
 */
export async function applyControl(
  writer: ScrcpyControlMessageWriter,
  size: () => DeviceSize,
  messages: readonly MirrorControlMessage[],
): Promise<Result<void>> {
  try {
    for (const message of messages) {
      await sendOne(writer, size, message)
    }
    return ok(undefined)
  } catch (thrown) {
    // Writer hỏng = socket điều khiển tới scrcpy-server đã đứt → `upstream`
    // (502), không phải `unknown` (500): lỗi ở phía máy, không phải ở mã này.
    const known = toAppError(thrown, CONTROL_FAILED)
    return err(known.kind === 'unknown' ? AppErrors.upstream(CONTROL_FAILED, { cause: thrown }) : known)
  }
}
