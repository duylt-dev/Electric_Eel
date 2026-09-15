import { AppErrors, type Result, err, ok } from '../../../core/result'
import { isSafeSerial } from '../../adb/entities/AdbDevice'

/**
 * Ba tham số chất lượng của scrcpy, CỐ ĐỊNH ở mức cao nhất.
 *
 * Trình duyệt không gửi và máy chủ không nhận ba con số này: chúng là hằng
 * ở đây, nơi duy nhất `TangoMirrorGateway` đọc. Không có đường nào để một giá
 * trị bịa (`maxSize: 9999`) lọt qua route rồi rơi thẳng vào
 * `AdbScrcpyOptions3_3_3` — cái giá của việc đó là một tham số vô nghĩa
 * được ghép thẳng vào tiến trình `app_process` chạy trên máy chủ.
 *
 *   maxSize 0  — scrcpy hiểu là giữ độ phân giải GỐC của máy.
 *   maxFps 0   — scrcpy hiểu là không chặn, chảy theo tần số quét của màn.
 *   12 Mbps    — trần từng có trong ô chọn của tool, đã đo trên máy thật.
 *
 * Từng có ba ô chọn (1024/1440/1920/gốc · 30/60 · 2/4/8/12) khi mirror còn là
 * công cụ riêng; nay chỉ còn ô nhúng trong Logcat và người dùng muốn nét
 * nhất, không muốn chỉnh.
 */
export const MIRROR_QUALITY = {
  maxSize: 0,
  maxFps: 0,
  bitRateMbps: 12,
} as const

export interface MirrorRequest {
  readonly serial: string
  /** Có mở kênh điều khiển (chạm/phím) hay chỉ xem. */
  readonly control: boolean
}

/**
 * Đọc và kiểm yêu cầu mở mirror từ trình duyệt.
 *
 * `serial` đi qua `isSafeSerial` ngay ở đây — tầng dưới (`data/` gọi
 * `client.createAdb({ serial })`) không kiểm lại, nên bỏ sót bước này ở đây là
 * bỏ sót vĩnh viễn, không phải "kiểm hai lần cho chắc".
 */
export function normalizeMirrorRequest(raw: unknown): Result<MirrorRequest> {
  if (typeof raw !== 'object' || raw === null) {
    return err(AppErrors.validation('Yêu cầu mirror phải là một object.'))
  }
  const body = raw as Record<string, unknown>

  if (typeof body.serial !== 'string' || !isSafeSerial(body.serial)) {
    return err(AppErrors.validation('Serial thiết bị không hợp lệ.'))
  }

  if (body.control !== undefined && typeof body.control !== 'boolean') {
    return err(AppErrors.validation('`control` phải là true/false.'))
  }

  return ok({ serial: body.serial, control: body.control === true })
}
