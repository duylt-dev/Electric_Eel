'use client'

import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { deviceLabel, isUsable, stateLabel } from '@/domain/adb/entities/AdbDevice'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Danh sách thiết bị adb đang thấy.
 *
 * Máy `unauthorized` và `offline` vẫn hiện, chỉ là bấm không được. Ẩn chúng đi
 * thì người vừa cắm cáp sẽ thấy một danh sách trống và kết luận là công cụ
 * hỏng, trong khi thứ họ cần làm chỉ là mở khoá màn hình rồi bấm "Cho phép".
 */
export interface DeviceListProps {
  devices: readonly AdbDevice[]
  selectedSerial: string | null
  onSelect: (serial: string) => void
}

export function DeviceList({ devices, selectedSerial, onSelect }: DeviceListProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      }}
    >
      {devices.map((device) => {
        const selected = device.serial === selectedSerial
        const usable = isUsable(device)

        return (
          <Box
            key={device.serial}
            sx={{
              borderRadius: `${m3Shape.large}px`,
              border: `1px solid ${selected ? m3('primary') : m3('outlineVariant')}`,
              backgroundColor: selected ? m3('primaryContainer') : m3('surfaceContainerLow'),
              opacity: usable ? 1 : 0.6,
              overflow: 'hidden',
            }}
          >
            <ButtonBase
              disabled={!usable}
              onClick={() => onSelect(device.serial)}
              sx={{ width: '100%', p: 4, justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <Stack direction="row" sx={{ gap: 3, alignItems: 'flex-start', minWidth: 0, width: '100%' }}>
                <Box sx={{ color: selected ? m3('onPrimaryContainer') : m3('onSurfaceVariant'), mt: 0.5 }}>
                  <PhoneAndroidIcon />
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="subtitle1"
                    noWrap
                    sx={{ color: selected ? m3('onPrimaryContainer') : m3('onSurface') }}
                  >
                    {deviceLabel(device)}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      display: 'block',
                      fontFamily: MONO_FONT_STACK,
                      color: selected ? m3('onPrimaryContainer') : m3('onSurfaceVariant'),
                    }}
                  >
                    {device.serial}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <StatusChip tone={usable ? 'ok' : 'warn'} dot>
                      {stateLabel(device.state)}
                    </StatusChip>
                  </Box>
                </Box>
              </Stack>
            </ButtonBase>
          </Box>
        )
      })}
    </Box>
  )
}
