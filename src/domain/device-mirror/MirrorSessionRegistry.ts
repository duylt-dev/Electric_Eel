import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Dữ liệu thuần của một phiên — KHÔNG mang `handle`. `register()` nhận handle
 * qua một tham số RIÊNG (xem bên dưới) để kiểu `MirrorSessionInput` không bao
 * giờ lẫn với kiểu `MirrorDeviceSession` thật của Tango — registry (và test
 * của nó) không cần biết `MirrorDeviceSession` là gì.
 */
export interface MirrorSessionInput {
  readonly id: string
  readonly serial: string
  readonly userId: string
  readonly startedAt: number
}

export interface MirrorSessionEntry<H> extends MirrorSessionInput {
  readonly handle: H
}

/**
 * Bảng phiên mirror đang sống, `globalThis` ở phía dùng thật (phase 03) để
 * sống sót qua HMR — xem quyết định #4 trong `plan.md`. Generic theo `H`
 * (kiểu handle) để test viết được bằng một handle giả bất kỳ (`string`, một
 * object rỗng…) mà KHÔNG cần import `MirrorDeviceSession`/Tango.
 *
 * KHÔNG có TTL: một phiên chết theo `AbortSignal` của chính request stream đã
 * mở nó — `release()` luôn được gọi trong `finally` ở route, không phải ở
 * đây. Registry chỉ là `Map` + chỉ mục theo serial + kiểm chủ sở hữu, không tự
 * dọn gì cả.
 */
export class MirrorSessionRegistry<H> {
  private byId = new Map<string, MirrorSessionEntry<H>>()
  private idBySerial = new Map<string, string>()

  /** Một serial chỉ có ĐÚNG MỘT phiên tại một thời điểm — `conflict` nếu đang bận. */
  register(entry: MirrorSessionInput, handle: H): Result<void> {
    const existingId = this.idBySerial.get(entry.serial)
    if (existingId !== undefined && this.byId.has(existingId)) {
      return err(AppErrors.conflict(`Thiết bị ${entry.serial} đang có một phiên mirror khác đang chạy.`))
    }

    this.byId.set(entry.id, { ...entry, handle })
    this.idBySerial.set(entry.serial, entry.id)
    return ok(undefined)
  }

  release(id: string): void {
    const entry = this.byId.get(id)
    if (entry === undefined) return

    this.byId.delete(id)
    // Chỉ xoá chỉ mục serial nếu nó vẫn trỏ về ĐÚNG phiên này — phòng trường
    // hợp release() tới trễ sau khi một phiên MỚI đã chiếm lại serial đó.
    if (this.idBySerial.get(entry.serial) === id) {
      this.idBySerial.delete(entry.serial)
    }
  }

  /** `notFound` khi phiên không tồn tại (đã hết hoặc chưa từng có); `forbidden` khi khác chủ. */
  find(id: string, userId: string): Result<MirrorSessionEntry<H>> {
    const entry = this.byId.get(id)
    if (entry === undefined) return err(AppErrors.notFound('Phiên mirror không còn tồn tại.'))
    if (entry.userId !== userId) return err(AppErrors.forbidden('Phiên mirror này không thuộc về bạn.'))
    return ok(entry)
  }

  bySerial(serial: string): MirrorSessionEntry<H> | null {
    const id = this.idBySerial.get(serial)
    if (id === undefined) return null
    return this.byId.get(id) ?? null
  }
}
