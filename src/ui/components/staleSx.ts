import { motion } from '../theme/m3Tokens'

/**
 * Nội dung đang được thay bằng bản mới (lọc lại cho ký tự vừa gõ, chờ máy chủ
 * trả trang kế) thì mờ nhẹ đi thay vì nhấp nháy hay đứng im. Chuyển bằng
 * token M3, và tắt hẳn với người bật "giảm chuyển động".
 *
 *     <Table sx={{ minWidth: 720, ...staleSx(query !== deferredQuery) }}>
 */
export const staleSx = (stale: boolean) =>
  ({
    opacity: stale ? 0.6 : 1,
    transition: `opacity ${motion.duration.fast}ms ${motion.standard}`,
    [motion.reduced]: { transition: 'none' },
  }) as const
