import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/session'
import { BRAND_NAME } from '@/ui/brand'
import { BrandMark } from '@/ui/components/BrandMark'
import { m3, m3Mono } from '@/ui/theme/m3Tokens'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Đăng nhập' }

/**
 * Ba câu nói công cụ này làm gì. Không phải để quảng cáo — người mở trang này
 * lần đầu thường là người vừa được thêm vào dự án, và họ cần biết mình sắp đăng
 * nhập vào cái gì.
 */
const CAPABILITIES = [
  ['Biểu mẫu', 'Sửa cấu hình quảng cáo bằng ô nhập, không phải bằng cách gõ JSON.'],
  ['Kiểm tra', 'Bắt lỗi trước khi đẩy lên: sai tên trường, ad unit lạc, template SDK không dựng được.'],
  ['Điều kiện', 'Mỗi điều kiện Firebase là một biến thể riêng, kiểm tra riêng.'],
] as const

export default async function LoginPage() {
  const user = await currentUser()
  if (user !== null) redirect('/remote-config')

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 440px)' },
        bgcolor: m3('surface'),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { xs: 6, md: 14 },
          py: { xs: 10, md: 14 },
          borderRight: { md: `1px solid ${m3('outlineVariant')}` },
        }}
      >
        <Box sx={{ maxWidth: 620 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 3, mb: 8 }}>
            <BrandMark size={40} />
            <Typography sx={{ ...m3Mono.eyebrow, color: m3('onSurfaceVariant') }}>{BRAND_NAME}</Typography>
          </Stack>

          <Typography variant="h1" sx={{ mb: 4 }}>
            Sửa Remote Config mà không phải mở JSON
          </Typography>
          <Typography sx={{ color: m3('onSurfaceVariant'), fontSize: '1.08rem', maxWidth: '52ch', mb: 10 }}>
            Một trường gõ sai tên thì SDK bỏ qua nó, không log, không crash — và không ai biết cho tới
            khi doanh thu tụt. Công cụ này bắt những lỗi đó trước khi cấu hình rời khỏi máy bạn.
          </Typography>

          <Stack spacing={5} sx={{ maxWidth: '60ch' }}>
            {CAPABILITIES.map(([label, description]) => (
              <Box key={label} sx={{ borderLeft: `2px solid ${m3('outlineVariant')}`, pl: 4 }}>
                <Typography sx={{ ...m3Mono.columnHeader, color: m3('primary'), mb: 1 }}>{label}</Typography>
                <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
                  {description}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          px: { xs: 6, md: 10 },
          py: { xs: 10, md: 14 },
          bgcolor: m3('surfaceContainerLow'),
          borderTop: { xs: `1px solid ${m3('outlineVariant')}`, md: 'none' },
        }}
      >
        <LoginForm />
      </Box>
    </Box>
  )
}
