'use client'

import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh'
import HomeIcon from '@mui/icons-material/Home'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation'
import ViewCarouselIcon from '@mui/icons-material/ViewCarousel'
import VolumeDownIcon from '@mui/icons-material/VolumeDown'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import type { ReactNode } from 'react'

import type { MirrorKey } from '@/domain/device-mirror/entities/MirrorControlMessage'

export interface MirrorControlsProps {
  /** `canControl(state)` — tắt cả hàng khi không gửi được lệnh. */
  controllable: boolean
  /** Luồng đang chảy — nút chụp chỉ cần thế, không cần bật điều khiển. */
  streaming: boolean
  /** Ước lượng từ State — tooltip nói rõ là ước lượng. */
  displayOn: boolean
  onKey: (key: MirrorKey) => void
  onRotate: () => void
  onDisplayPowerToggle: () => void
  onNotifications: () => void
  onSnapshot: () => void
}

/** Một nút: nhãn (aria + tooltip), icon, và HẬU QUẢ khi bấm — tooltip nói hậu quả, không nhắc lại tên. */
interface ControlButton {
  readonly label: string
  readonly hint: string
  readonly icon: ReactNode
  readonly onClick: () => void
  readonly disabled: boolean
}

/**
 * Hàng nút điều khiển: ba phím điều hướng, âm lượng, nguồn, xoay, tắt/bật
 * màn hình, kéo thanh thông báo, chụp PNG. Icon nhỏ để vừa cả ô nhúng ~340px
 * cạnh log lẫn trang mirror đầy đủ.
 *
 * Chỉ vẽ và gọi callback — không biết ViewModel.
 */
export function MirrorControls({
  controllable,
  streaming,
  displayOn,
  onKey,
  onRotate,
  onDisplayPowerToggle,
  onNotifications,
  onSnapshot,
}: MirrorControlsProps) {
  const off = !controllable
  const groups: ControlButton[][] = [
    [
      { label: 'Back', hint: 'Phím Back — chuột phải trên hình cũng vậy.', icon: <ArrowBackIcon fontSize="small" />, onClick: () => onKey('back'), disabled: off },
      { label: 'Home', hint: 'Về màn hình chính — chuột giữa trên hình cũng vậy.', icon: <HomeIcon fontSize="small" />, onClick: () => onKey('home'), disabled: off },
      { label: 'App gần đây', hint: 'Mở danh sách app gần đây.', icon: <ViewCarouselIcon fontSize="small" />, onClick: () => onKey('appSwitch'), disabled: off },
    ],
    [
      { label: 'Giảm âm lượng', hint: 'Giảm một nấc âm lượng trên máy.', icon: <VolumeDownIcon fontSize="small" />, onClick: () => onKey('volumeDown'), disabled: off },
      { label: 'Tăng âm lượng', hint: 'Tăng một nấc âm lượng trên máy.', icon: <VolumeUpIcon fontSize="small" />, onClick: () => onKey('volumeUp'), disabled: off },
      { label: 'Nguồn', hint: 'Bấm phím nguồn: KHOÁ máy. Mở lại bằng chính nút này lần nữa.', icon: <PowerSettingsNewIcon fontSize="small" />, onClick: () => onKey('power'), disabled: off },
    ],
    [
      { label: 'Xoay', hint: 'Xoay màn hình máy. Máy đang tự xoay theo cảm biến thì có thể không đổi.', icon: <ScreenRotationIcon fontSize="small" />, onClick: onRotate, disabled: off },
      {
        label: displayOn ? 'Tắt màn hình máy' : 'Bật màn hình máy',
        hint: displayOn
          ? 'Tắt màn hình trên máy nhưng hình vẫn chảy về đây — chạy lâu không sáng màn. Trạng thái là ước lượng theo lệnh vừa gửi.'
          : 'Bật lại màn hình trên máy.',
        icon: displayOn ? <Brightness4Icon fontSize="small" /> : <BrightnessHighIcon fontSize="small" />,
        onClick: onDisplayPowerToggle,
        disabled: off,
      },
      { label: 'Thanh thông báo', hint: 'Kéo thanh thông báo xuống.', icon: <NotificationsIcon fontSize="small" />, onClick: onNotifications, disabled: off },
    ],
    [
      { label: 'Chụp PNG', hint: 'Lưu khung hình đang thấy thành PNG — độ phân giải của luồng, không phải của máy.', icon: <PhotoCameraIcon fontSize="small" />, onClick: onSnapshot, disabled: !streaming },
    ],
  ]

  return (
    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
      {groups.map((group, index) => (
        <Stack key={group[0]?.label} direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
          {index > 0 && <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />}
          {group.map((button) => (
            <Tooltip key={button.label} title={button.hint}>
              <span>
                <IconButton size="small" aria-label={button.label} onClick={button.onClick} disabled={button.disabled}>
                  {button.icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
