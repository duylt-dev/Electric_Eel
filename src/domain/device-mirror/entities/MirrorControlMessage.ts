export type MirrorTouchAction = 'down' | 'up' | 'move'

export interface MirrorTouchMessage {
  readonly type: 'touch'
  readonly action: MirrorTouchAction
  /** 0..9 — Android không phân biệt được nhiều hơn 10 ngón cùng lúc. */
  readonly pointer: number
  readonly nx: number
  readonly ny: number
  readonly pressure: number
}

export interface MirrorScrollMessage {
  readonly type: 'scroll'
  readonly nx: number
  readonly ny: number
  readonly dx: number
  readonly dy: number
}

/**
 * Chỉ chín phím — đủ cho điều khiển cơ bản, và mỗi phím có mã Android CỐ ĐỊNH
 * (không đổi giữa các bản Android), nên không cần tra bảng runtime từ Tango.
 * `back`, `home`, `appSwitch` là ba phím điều hướng hệ thống — Android 10+ ẩn
 * thanh điều hướng bằng cử chỉ vuốt thật ra vẫn nhận đúng các mã này.
 */
export type MirrorKey =
  | 'back'
  | 'home'
  | 'appSwitch'
  | 'power'
  | 'volumeUp'
  | 'volumeDown'
  | 'menu'
  | 'enter'
  | 'backspace'

export const MIRROR_KEYCODES: Record<MirrorKey, number> = {
  back: 4,
  home: 3,
  appSwitch: 187,
  power: 26,
  volumeUp: 24,
  volumeDown: 25,
  menu: 82,
  enter: 66,
  backspace: 67,
}

export interface MirrorKeyMessage {
  readonly type: 'key'
  readonly action: 'down' | 'up'
  readonly key: MirrorKey
}

export interface MirrorTextMessage {
  readonly type: 'text'
  readonly text: string
}

/** scrcpy BACK_OR_SCREEN_ON: màn hình đang tắt thì bật lên, đang bật thì bấm Back. */
export interface MirrorBackOrScreenOnMessage {
  readonly type: 'backOrScreenOn'
  readonly action: 'down' | 'up'
}

export interface MirrorDisplayPowerMessage {
  readonly type: 'displayPower'
  readonly on: boolean
}

export interface MirrorRotateMessage {
  readonly type: 'rotate'
}

export interface MirrorExpandNotificationsMessage {
  readonly type: 'expandNotifications'
}

/**
 * Mọi thông điệp điều khiển trình duyệt có thể gửi lên. Kiểm dữ liệu vào
 * (`validateControlBatch`) tách sang `validateMirrorControlBatch.ts` — cùng
 * file này thì vượt quá 200 dòng (`development-rules.md`), và tách theo
 * hướng type/logic cũng khớp cách `domain/ads` tách `entities/` khỏi
 * `validation/`.
 */
export type MirrorControlMessage =
  | MirrorTouchMessage
  | MirrorScrollMessage
  | MirrorKeyMessage
  | MirrorTextMessage
  | MirrorBackOrScreenOnMessage
  | MirrorDisplayPowerMessage
  | MirrorRotateMessage
  | MirrorExpandNotificationsMessage
