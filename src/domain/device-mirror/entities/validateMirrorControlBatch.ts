import { AppErrors, type Result, err, ok } from '../../../core/result'
import { MIRROR_KEYCODES, type MirrorControlMessage, type MirrorKey } from './MirrorControlMessage'

/**
 * Trần một lô — `ControlOutbox` gộp move trước khi gửi, nên một lô hợp lệ
 * KHÔNG BAO GIỜ là luồng chạm thô 60fps; 64 đã rộng hơn nhiều so với số thông
 * điệp một lượt gộp thực tế sinh ra.
 */
const MAX_BATCH_SIZE = 64
const MAX_TEXT_LENGTH = 300

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

/** Mã ký tự của dòng mới và của DEL — biên của dải điều khiển ASCII thấp là 0..31. */
const CONTROL_LOW_MAX = 31
const NEWLINE_CODE = 10
const DEL_CODE = 127

/**
 * Bỏ ký tự điều khiển (mã 0..31 trừ dòng mới, và DEL mã 127) khỏi văn bản gõ
 * vào máy. Dòng mới được giữ vì ô nhập nhiều dòng là cách dùng hợp lệ; các ký
 * tự điều khiển khác (ví dụ ESC) không có nghĩa gì với `injectText`/
 * clipboard-paste, và một số terminal/console phía server có thể diễn giải
 * chúng thành hành vi không mong muốn nếu bị log nguyên văn.
 *
 * Duyệt theo MÃ ký tự thay vì regex chứa ký tự điều khiển thô trong charclass
 * — một biểu thức như vậy dễ bị công cụ soạn thảo/định dạng biến tướng thành
 * byte thật nằm ngay trong file nguồn, khó phát hiện khi đọc lại. Vòng lặp
 * theo mã luôn tường minh và không phụ thuộc cách một công cụ mã hoá backslash.
 */
function stripControlChars(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isControl = (code <= CONTROL_LOW_MAX && code !== NEWLINE_CODE) || code === DEL_CODE
    if (!isControl) out += char
  }
  return out
}

function validateOne(item: unknown): Result<MirrorControlMessage> {
  if (typeof item !== 'object' || item === null) {
    return err(AppErrors.validation('Thông điệp điều khiển phải là một object.'))
  }
  const raw = item as Record<string, unknown>

  switch (raw.type) {
    case 'touch': {
      if (raw.action !== 'down' && raw.action !== 'up' && raw.action !== 'move') {
        return err(AppErrors.validation('Hành động chạm không hợp lệ.'))
      }
      if (!isFiniteNumber(raw.pointer) || !Number.isInteger(raw.pointer) || !inRange(raw.pointer, 0, 9)) {
        return err(AppErrors.validation('Số ngón tay (pointer) phải là số nguyên 0–9.'))
      }
      if (!isFiniteNumber(raw.nx) || !inRange(raw.nx, 0, 1)) {
        return err(AppErrors.validation('Toạ độ nx phải trong khoảng [0, 1].'))
      }
      if (!isFiniteNumber(raw.ny) || !inRange(raw.ny, 0, 1)) {
        return err(AppErrors.validation('Toạ độ ny phải trong khoảng [0, 1].'))
      }
      if (!isFiniteNumber(raw.pressure) || !inRange(raw.pressure, 0, 1)) {
        return err(AppErrors.validation('Lực chạm (pressure) phải trong khoảng [0, 1].'))
      }
      return ok({
        type: 'touch',
        action: raw.action,
        pointer: raw.pointer,
        nx: raw.nx,
        ny: raw.ny,
        pressure: raw.pressure,
      })
    }
    case 'scroll': {
      if (!isFiniteNumber(raw.nx) || !inRange(raw.nx, 0, 1)) {
        return err(AppErrors.validation('Toạ độ nx phải trong khoảng [0, 1].'))
      }
      if (!isFiniteNumber(raw.ny) || !inRange(raw.ny, 0, 1)) {
        return err(AppErrors.validation('Toạ độ ny phải trong khoảng [0, 1].'))
      }
      if (!isFiniteNumber(raw.dx) || !inRange(raw.dx, -1, 1)) {
        return err(AppErrors.validation('Độ lệch dx phải trong khoảng [-1, 1].'))
      }
      if (!isFiniteNumber(raw.dy) || !inRange(raw.dy, -1, 1)) {
        return err(AppErrors.validation('Độ lệch dy phải trong khoảng [-1, 1].'))
      }
      return ok({ type: 'scroll', nx: raw.nx, ny: raw.ny, dx: raw.dx, dy: raw.dy })
    }
    case 'key': {
      if (raw.action !== 'down' && raw.action !== 'up') {
        return err(AppErrors.validation('Hành động phím không hợp lệ.'))
      }
      if (typeof raw.key !== 'string' || !(raw.key in MIRROR_KEYCODES)) {
        return err(AppErrors.validation('Phím không nằm trong danh sách hỗ trợ.'))
      }
      return ok({ type: 'key', action: raw.action, key: raw.key as MirrorKey })
    }
    case 'text': {
      if (typeof raw.text !== 'string') return err(AppErrors.validation('`text` phải là chuỗi.'))
      // Chặn độ dài THÔ trước khi duyệt từng ký tự: một chuỗi 10 MB toàn ký tự
      // điều khiển mà strip trước thì tốn CPU tuyến tính rồi… qua kiểm vì đã
      // rỗng. ×4 để chừa chỗ cho ký tự điều khiển hợp lệ sẽ bị bỏ.
      if (raw.text.length > MAX_TEXT_LENGTH * 4) {
        return err(AppErrors.validation(`Văn bản tối đa ${String(MAX_TEXT_LENGTH)} ký tự.`))
      }
      const text = stripControlChars(raw.text)
      if (text.length > MAX_TEXT_LENGTH) {
        return err(AppErrors.validation(`Văn bản tối đa ${String(MAX_TEXT_LENGTH)} ký tự.`))
      }
      return ok({ type: 'text', text })
    }
    case 'backOrScreenOn': {
      if (raw.action !== 'down' && raw.action !== 'up') {
        return err(AppErrors.validation('Hành động backOrScreenOn không hợp lệ.'))
      }
      return ok({ type: 'backOrScreenOn', action: raw.action })
    }
    case 'displayPower': {
      if (typeof raw.on !== 'boolean') return err(AppErrors.validation('`on` phải là true/false.'))
      return ok({ type: 'displayPower', on: raw.on })
    }
    case 'rotate':
      return ok({ type: 'rotate' })
    case 'expandNotifications':
      return ok({ type: 'expandNotifications' })
    default:
      return err(AppErrors.validation('Loại thông điệp điều khiển không rõ.'))
  }
}

/**
 * Kiểm một lô thông điệp điều khiển từ trình duyệt.
 *
 * Đây là chốt chặn DUY NHẤT trước khi dữ liệu tới `handle.control` (Tango) —
 * không nhánh nào trong `dispatchMirrorControl` được bỏ qua hàm này. Hỏng ở
 * bất kỳ một phần tử nào thì DỪNG NGAY và trả lỗi cho cả lô, không âm thầm bỏ
 * qua phần tử xấu: bỏ qua lặng lẽ nghĩa là trình duyệt tưởng thao tác đã gửi
 * trong khi máy không nhận được gì, và người dùng đi tìm lỗi sai chỗ.
 */
export function validateControlBatch(raw: unknown): Result<MirrorControlMessage[]> {
  if (!Array.isArray(raw)) return err(AppErrors.validation('Lô thông điệp điều khiển phải là một mảng.'))
  if (raw.length > MAX_BATCH_SIZE) {
    return err(
      AppErrors.validation(
        `Một lô điều khiển tối đa ${String(MAX_BATCH_SIZE)} thông điệp — trình duyệt phải gộp lô trước khi gửi.`,
      ),
    )
  }

  const messages: MirrorControlMessage[] = []
  for (const item of raw) {
    const message = validateOne(item)
    if (!message.ok) return message
    messages.push(message.value)
  }
  return ok(messages)
}
