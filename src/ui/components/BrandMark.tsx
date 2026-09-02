import Box from '@mui/material/Box'
import Image from 'next/image'

import { BRAND_LOGO_SRC } from '../brand'
import { m3, m3Shape } from '../theme/m3Tokens'

/**
 * Ô logo của supertool.
 *
 * Nền để đen (`scrim`) chứ không lấy theo nền trang: ảnh gốc là quầng sáng trên
 * nền đen tuyệt đối, đặt lên nền sáng thì quầng sáng biến thành vệt xám bẩn.
 * Đổi lại, ô đen nằm trên nền tối gần như biến mất, nên phải có viền mảnh.
 *
 * Kích thước truyền vào chứ không cố định: khung ứng dụng cần ô nhỏ cạnh tên
 * công cụ, trang đăng nhập cần ô to hơn vì ở đó nó là thứ đầu tiên đập vào mắt.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        overflow: 'hidden',
        lineHeight: 0,
        borderRadius: `${m3Shape.small}px`,
        bgcolor: m3('scrim'),
        border: `1px solid ${m3('outlineVariant')}`,
      }}
    >
      <Image src={BRAND_LOGO_SRC} alt="" width={size} height={size} priority />
    </Box>
  )
}
