import { type Result, ok } from '../../../core/result'
import { validateControlBatch } from '../entities/validateMirrorControlBatch'
import type { MirrorSessionRegistry } from '../MirrorSessionRegistry'
import type { MirrorDeviceSession } from '../repositories/MirrorDeviceGateway'

export interface DispatchMirrorControlDeps {
  readonly registry: MirrorSessionRegistry<MirrorDeviceSession>
}

/**
 * Kiểm phiên (tồn tại + đúng chủ) RỒI MỚI kiểm dữ liệu vào, trước khi chạm
 * tới Tango. Không nhánh nào của `handle.control` nhận được thứ chưa qua
 * `validateControlBatch`.
 *
 * Trả về SỐ thông điệp đã gửi, không trả nguyên batch — route chỉ cần con số
 * đó để ghi log gọn ("đã gửi n thông điệp"), không cần đọc lại nội dung đã tự
 * validate.
 */
export async function dispatchMirrorControl(
  deps: DispatchMirrorControlDeps,
  sessionId: string,
  userId: string,
  rawBatch: unknown,
): Promise<Result<number>> {
  const found = deps.registry.find(sessionId, userId)
  if (!found.ok) return found

  const batch = validateControlBatch(rawBatch)
  if (!batch.ok) return batch
  if (batch.value.length === 0) return ok(0)

  const sent = await found.value.handle.control(batch.value)
  if (!sent.ok) return sent

  return ok(batch.value.length)
}
