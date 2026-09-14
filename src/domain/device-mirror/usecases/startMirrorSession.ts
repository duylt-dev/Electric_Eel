import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { MirrorRequest } from '../entities/MirrorRequest'
import type { MirrorSessionRegistry } from '../MirrorSessionRegistry'
import type { MirrorDeviceGateway, MirrorDeviceSession } from '../repositories/MirrorDeviceGateway'

export interface StartMirrorSessionDeps {
  readonly gateway: MirrorDeviceGateway
  readonly registry: MirrorSessionRegistry<MirrorDeviceSession>
}

export interface StartedMirrorSession {
  readonly id: string
  readonly session: MirrorDeviceSession
}

/**
 * Mở một phiên mirror: kiểm serial chưa bận → mở phiên thật trên máy → đăng
 * ký vào bảng phiên.
 *
 * Serial đang bận thì tuỳ AI đang giữ: người KHÁC → `conflict` (409), một máy
 * một người xem tại một thời điểm. CHÍNH người này → tiếp quản: đóng phiên cũ
 * rồi mở phiên mới. Hai lý do thật: (1) đổi chất lượng là "huỷ luồng cũ, mở
 * luồng mới" trong cùng một tick ở trình duyệt, và Node có thể nhận request
 * mới TRƯỚC sự kiện `close` của socket cũ — không tiếp quản thì đổi chất
 * lượng thỉnh thoảng ra 409; (2) tab cũ chết mà máy chủ chưa kịp biết. Phiên
 * cũ (nếu còn ai đọc) thấy luồng kết thúc như scrcpy-server đóng bất ngờ.
 *
 * Thứ tự hai bước cuối CỐ Ý ngược trực giác — mở máy TRƯỚC, đăng ký SAU — vì
 * `gateway.start` là bước duy nhất biết chắc máy có mở được hay không; kiểm
 * `bySerial` ở đầu chỉ là đường tắt trả lỗi sớm, không phải chốt chặn cuối.
 * Chốt chặn cuối là `register()`, và nếu nó vẫn hỏng — hai request cùng gọi
 * mirror một serial lọt qua khe hở giữa lúc `bySerial` đã trả null và lúc
 * request kia kịp đăng ký — thì phiên VỪA MỞ phải bị đóng ngay lập tức. Không
 * đóng thì đó là một scrcpy-server sống trên máy chủ mà không ai còn giữ tham
 * chiếu, không hàm nào gọi được `close()` lên nó nữa.
 */
export async function startMirrorSession(
  deps: StartMirrorSessionDeps,
  request: MirrorRequest,
  userId: string,
  newId: () => string,
  signal: AbortSignal,
): Promise<Result<StartedMirrorSession>> {
  const existing = deps.registry.bySerial(request.serial)
  if (existing !== null) {
    if (existing.userId !== userId) {
      return err(AppErrors.conflict(`Thiết bị ${request.serial} đang có một phiên mirror khác đang chạy.`))
    }
    // Tiếp quản phiên của chính mình — release TRƯỚC close để một lượt
    // `release()` tới trễ từ route cũ không đụng vào phiên mới (registry chỉ
    // xoá chỉ mục serial nếu nó còn trỏ về đúng phiên cũ).
    deps.registry.release(existing.id)
    await existing.handle.close()
  }

  const started = await deps.gateway.start(request, signal)
  if (!started.ok) return started

  const id = newId()
  const registered = deps.registry.register(
    { id, serial: request.serial, userId, startedAt: Date.now() },
    started.value,
  )
  if (!registered.ok) {
    await started.value.close()
    return registered
  }

  return ok({ id, session: started.value })
}
