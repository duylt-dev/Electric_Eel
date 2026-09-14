import { AppErrors, type Result, err, ok } from '../../../core/result'
import { isSafeSerial } from '../../adb/entities/AdbDevice'

/**
 * Ba enum chất lượng, mỗi enum là NGUỒN DUY NHẤT cho cả server lẫn UI.
 *
 * Server chỉ chấp giá trị nằm trong ba mảng này (`normalizeMirrorRequest`), UI
 * chỉ hiện giá trị trong ba mảng này. Không có đường nào để một giá trị bịa
 * (`maxSize: 9999`) lọt qua route rồi rơi thẳng vào `AdbScrcpyOptions3_3_3` —
 * cái giá của việc đó là một tham số vô nghĩa được ghép thẳng vào tiến trình
 * `app_process` chạy trên máy chủ.
 */
export const MIRROR_MAX_SIZES = [1024, 1440, 1920, 0] as const
export const MIRROR_FPS = [30, 60] as const
export const MIRROR_BIT_RATES_MBPS = [2, 4, 8, 12] as const

export type MirrorMaxSize = (typeof MIRROR_MAX_SIZES)[number]
export type MirrorFps = (typeof MIRROR_FPS)[number]
export type MirrorBitRateMbps = (typeof MIRROR_BIT_RATES_MBPS)[number]

export interface MirrorRequest {
  readonly serial: string
  /** 0 = giữ độ phân giải GỐC của máy — scrcpy hiểu `maxSize: 0` đúng nghĩa này. */
  readonly maxSize: MirrorMaxSize
  readonly maxFps: MirrorFps
  readonly bitRateMbps: MirrorBitRateMbps
  /** Có mở kênh điều khiển (chạm/phím) hay chỉ xem. */
  readonly control: boolean
}

/** Mặc định theo quyết định #5 trong `plan.md`: 1440p / 60fps / 8Mbps. */
export const DEFAULT_MIRROR_QUALITY: Pick<MirrorRequest, 'maxSize' | 'maxFps' | 'bitRateMbps'> = {
  maxSize: 1440,
  maxFps: 60,
  bitRateMbps: 8,
}

function pickEnum<T extends readonly (string | number)[]>(
  allowed: T,
  value: unknown,
  fallback: T[number],
  label: string,
): Result<T[number]> {
  if (value === undefined) return ok(fallback)
  if (!(allowed as readonly unknown[]).includes(value)) {
    return err(AppErrors.validation(`${label} không hợp lệ. Chỉ nhận: ${allowed.join(', ')}.`))
  }
  return ok(value as T[number])
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

  const maxSize = pickEnum(MIRROR_MAX_SIZES, body.maxSize, DEFAULT_MIRROR_QUALITY.maxSize, 'Độ phân giải (maxSize)')
  if (!maxSize.ok) return maxSize

  const maxFps = pickEnum(MIRROR_FPS, body.maxFps, DEFAULT_MIRROR_QUALITY.maxFps, 'Tốc độ khung hình (maxFps)')
  if (!maxFps.ok) return maxFps

  const bitRateMbps = pickEnum(
    MIRROR_BIT_RATES_MBPS,
    body.bitRateMbps,
    DEFAULT_MIRROR_QUALITY.bitRateMbps,
    'Bitrate',
  )
  if (!bitRateMbps.ok) return bitRateMbps

  if (body.control !== undefined && typeof body.control !== 'boolean') {
    return err(AppErrors.validation('`control` phải là true/false.'))
  }

  return ok({
    serial: body.serial,
    maxSize: maxSize.value,
    maxFps: maxFps.value,
    bitRateMbps: bitRateMbps.value,
    control: body.control === true,
  })
}
