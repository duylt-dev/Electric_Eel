/**
 * Một thiết bị mà `adb` đang nhìn thấy.
 *
 * `serial` là định danh duy nhất và cũng là thứ được ghép thẳng vào dòng lệnh
 * (`adb -s <serial> …`), nên nó phải đi qua `isSafeSerial` trước khi rời khỏi
 * tầng này. Xem ghi chú ở hàm đó.
 */
export type AdbDeviceState =
  /** Sẵn sàng nhận lệnh. Chỉ trạng thái này mới đọc log được. */
  | 'device'
  /** Máy đã cắm nhưng chưa bấm "Cho phép gỡ lỗi USB". */
  | 'unauthorized'
  /** adb thấy máy nhưng không nói chuyện được — thường do vừa rút hoặc vừa khởi động lại. */
  | 'offline'
  | 'unknown'

export interface AdbDevice {
  readonly serial: string
  readonly state: AdbDeviceState
  /** Tên máy do nhà sản xuất đặt, ví dụ `SM_A546E`. `null` khi adb không nói. */
  readonly model: string | null
  readonly product: string | null
}

/**
 * Serial hợp lệ: bắt đầu bằng chữ hoặc số, phần còn lại là chữ, số và bốn dấu
 * mà serial thật có thể chứa (`emulator-5554`, `192.168.1.20:5555`).
 *
 * Ký tự đầu KHÔNG được là dấu gạch ngang, và đó mới là lý do chính của hàm
 * này. Lệnh chạy bằng `spawn` không qua shell nên không có chuyện chèn `;` hay
 * `&&`, nhưng một serial mở đầu bằng `-` vẫn bị chính `adb` đọc thành cờ dòng
 * lệnh — tức là người dùng đặt được tuỳ chọn cho lệnh mà họ không được đặt.
 */
const SERIAL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export const isSafeSerial = (value: string): boolean => SERIAL.test(value)

export const isUsable = (device: AdbDevice): boolean => device.state === 'device'

/** Tên hiển thị: ưu tiên model vì đó là cái người ta nhận ra được. */
export function deviceLabel(device: AdbDevice): string {
  if (device.model !== null && device.model.length > 0) return device.model.replace(/_/g, ' ')
  return device.serial
}

export function stateLabel(state: AdbDeviceState): string {
  switch (state) {
    case 'device':
      return 'sẵn sàng'
    case 'unauthorized':
      return 'chưa cho phép gỡ lỗi'
    case 'offline':
      return 'mất kết nối'
    default:
      return 'không rõ'
  }
}

const readState = (raw: string): AdbDeviceState =>
  raw === 'device' || raw === 'unauthorized' || raw === 'offline' ? raw : 'unknown'

/**
 * Đọc kết quả của `adb devices -l`.
 *
 *     List of devices attached
 *     emulator-5554   device product:sdk_gphone64 model:sdk_gphone64 transport_id:1
 *     R58M12ABCDE     unauthorized usb:338690048 transport_id:2
 *
 * Dòng đầu là tiêu đề và bị bỏ. Các dòng còn lại: cột đầu là serial, cột thứ
 * hai là trạng thái, phần sau là các cặp `khoá:giá trị` có thể vắng mặt —
 * `unauthorized` thường không kèm model, nên đọc chúng phải chấp nhận thiếu.
 */
export function parseDevicesOutput(stdout: string): AdbDevice[] {
  const devices: AdbDevice[] = []

  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (line.startsWith('List of devices')) continue
    // adb in ra vài dòng thông báo khi tự khởi động daemon lần đầu.
    if (line.startsWith('*')) continue

    const parts = line.split(/\s+/)
    const serial = parts[0]
    const state = parts[1]
    if (serial === undefined || state === undefined) continue
    if (!isSafeSerial(serial)) continue

    const attributes = new Map<string, string>()
    for (const part of parts.slice(2)) {
      const separator = part.indexOf(':')
      if (separator <= 0) continue
      attributes.set(part.slice(0, separator), part.slice(separator + 1))
    }

    devices.push({
      serial,
      state: readState(state),
      model: attributes.get('model') ?? null,
      product: attributes.get('product') ?? null,
    })
  }

  return devices
}
