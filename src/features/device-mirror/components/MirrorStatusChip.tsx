'use client'

import { StatusChip } from '@/ui/components/StatusChip'
import type { StatusTone } from '@/ui/components/StatusChip'
import type { MirrorStatus } from '../DeviceMirrorContract'

const STATUS_TONE: Record<MirrorStatus, StatusTone> = {
  streaming: 'ok',
  connecting: 'info',
  failed: 'bad',
  stopped: 'neutral',
  unsupported: 'bad',
}

const STATUS_LABEL: Record<MirrorStatus, string> = {
  streaming: 'đang chảy',
  connecting: 'đang nối',
  failed: 'hỏng',
  stopped: 'đã dừng',
  unsupported: 'không hỗ trợ',
}

/**
 * Nhãn trạng thái luồng mirror.
 *
 * Một bảng chữ cho mọi nơi hiện trạng thái — hai nơi gọi cùng một trạng thái
 * bằng hai chữ khác nhau là kiểu lệch người dùng nhận ra ngay mà không ai
 * trong đội thấy.
 */
export function MirrorStatusChip({ status }: { status: MirrorStatus }) {
  return (
    <StatusChip tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </StatusChip>
  )
}
