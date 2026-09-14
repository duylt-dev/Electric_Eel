import { defineViewModel } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import type { MirrorVideoSink } from '@/domain/device-mirror/repositories/MirrorVideoSink'
import { initialDeviceMirrorState, isLive } from './DeviceMirrorContract'
import type { DeviceMirrorEffect, DeviceMirrorIntent, DeviceMirrorState } from './DeviceMirrorContract'
import { stream } from './mirrorStream'
import type { DeviceMirrorDeps } from './mirrorStream'

/**
 * ViewModel của màn mirror một thiết bị.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Canvas/decoder không đi qua đây: Root tạo `MirrorVideoSink` và truyền
 * xuống qua `deps.videoSink`, ViewModel chỉ gọi `push`, không biết gì về
 * `<canvas>` hay WebGL. Lượt mở luồng nằm ở `mirrorStream.ts`.
 */
export type { DeviceMirrorDeps } from './mirrorStream'

/**
 * Khoá gộp của luồng mirror. Mở luồng mới, bấm dừng, đổi chất lượng hay đổi
 * cờ điều khiển đều dùng chung khoá này — scrcpy không có API "đổi tham số
 * giữa chừng", nên mọi thay đổi tham số đều là "huỷ luồng cũ, mở luồng mới".
 */
const STREAM_KEY = 'stream'

export const DeviceMirrorViewModel = defineViewModel<
  DeviceMirrorState,
  DeviceMirrorIntent,
  DeviceMirrorEffect,
  DeviceMirrorDeps
>({
  name: 'DeviceMirror',

  initialState: (deps) => initialDeviceMirrorState(deps.serial),

  // Mở luồng ngay khi màn hình dựng lên — người ta vào đây để xem máy, không
  // phải để bấm một nút bắt đầu. v1 chỉ có đường WebCodecs (quyết định #5
  // trong `plan.md`): trình duyệt không hỗ trợ thì báo luôn, không cố decode.
  onStart: (ctx, deps) => {
    if (!deps.videoSink.supported) {
      ctx.setState((state) => ({ ...state, status: 'unsupported' }))
      ctx.emit({
        type: 'ShowMessage',
        severity: 'error',
        message: 'Trình duyệt không hỗ trợ WebCodecs — dùng Chrome hoặc Edge 94 trở lên.',
      })
      return
    }
    return stream(ctx, deps)
  },
  // Luồng mở ở `onStart` phải huỷ được bởi Dừng / Đổi chất lượng / Chạy lại.
  startKey: STREAM_KEY,

  intentKey: (intent) =>
    intent.type === 'StreamRequested' ||
    intent.type === 'StreamStopped' ||
    intent.type === 'QualityChanged' ||
    intent.type === 'ControlToggled'
      ? STREAM_KEY
      : undefined,

  async handleIntent(intent, ctx, deps) {
    switch (intent.type) {
      case 'StreamRequested':
        // Không có decoder thì không có gì để mở — Screen đã ẩn nút, đây là chốt chặn thứ hai.
        if (ctx.getState().status === 'unsupported') return
        await stream(ctx, deps)
        return

      case 'StreamStopped':
        // Luồng đang chạy đã bị chính khoá intent huỷ trước khi tới đây; ở đây
        // chỉ còn việc đưa màn hình về trạng thái bấm chạy lại được.
        ctx.setState((state) => ({ ...state, status: 'stopped' }))
        return

      // Hai intent dưới chỉ NỐI LẠI khi luồng đang sống. Đã Dừng/hỏng/không hỗ
      // trợ thì chỉ ghi nhớ tham số — "Chạy lại" sẽ dùng — chứ không tự mở
      // luồng sau lưng người vừa bấm Dừng. (Khoá intent đã huỷ luồng đang chảy
      // TRƯỚC khi tới đây, nhưng `status` vẫn là giá trị cũ nên `isLive` đọc đúng.)
      case 'QualityChanged':
        ctx.setState((state) => ({ ...state, quality: intent.quality }))
        if (isLive(ctx.getState())) await stream(ctx, deps)
        return

      case 'ControlToggled':
        // Server cần biết `control` ngay lúc bắt tay — không có cách bật kênh
        // điều khiển giữa chừng, nên đổi cờ này cũng là nối lại luồng.
        ctx.setState((state) => ({ ...state, controlEnabled: intent.enabled }))
        if (isLive(ctx.getState())) await stream(ctx, deps)
        return

      // ─ phase 06: chạm, cuộn, phím, gõ chữ, xoay, tắt/bật màn hình, kéo
      // thanh thông báo, chụp màn hình. Khai no-op ở đây để `switch` vét cạn
      // ngay từ phase này — phase 06 lấp nội dung, không sửa lại Contract.
      case 'TouchInput':
      case 'ScrollInput':
      case 'KeyTapped':
      case 'TextSubmitted':
      case 'RotateRequested':
      case 'DisplayPowerToggled':
      case 'NotificationsRequested':
      case 'SnapshotRequested':
        return
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  createDependencies: () => {
    throw new Error(
      'DeviceMirrorViewModel cần được cấp phụ thuộc: <DeviceMirrorViewModel.Provider deps={{ mirror, videoSink, serial }}>. ' +
        'serial và videoSink chỉ biết được ở thời điểm dựng màn hình nên không thể lấy mặc định ở đây.',
    )
  },
})

/** Phụ thuộc dùng thật trong ứng dụng. Test truyền bộ khác vào. */
export const deviceMirrorDeps = (serial: string, sink: MirrorVideoSink): DeviceMirrorDeps => ({
  mirror: clientContainer.deviceMirror.repository,
  videoSink: sink,
  serial,
})
