import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import HistoryIcon from '@mui/icons-material/History'
import InsightsIcon from '@mui/icons-material/Insights'
import TranslateIcon from '@mui/icons-material/Translate'
import TuneIcon from '@mui/icons-material/Tune'
import type { SvgIconComponent } from '@mui/icons-material'

/**
 * Danh mục công cụ của supertool.
 *
 * Remote Config chỉ là công cụ đầu tiên. Khai báo danh mục thành dữ liệu ở đây
 * để thêm một công cụ về sau là thêm một mục — không ai phải mở lại file layout,
 * và cũng không có chỗ nào để quên cập nhật.
 *
 * Công cụ ở trạng thái `planned` vẫn hiện trong thanh điều hướng nhưng không
 * bấm được. Hiện chúng là có chủ ý: người dùng thấy được đây là một nền tảng
 * chứ không phải một trang lẻ.
 */
export type ToolStatus = 'available' | 'planned'

export interface ToolDefinition {
  id: string
  label: string
  description: string
  href: string
  icon: SvgIconComponent
  status: ToolStatus
  adminOnly?: boolean
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'remote-config',
    label: 'Remote Config',
    description: 'Sửa cấu hình quảng cáo bằng biểu mẫu thay vì gõ JSON.',
    href: '/remote-config',
    icon: TuneIcon,
    status: 'available',
  },
  {
    id: 'audit',
    label: 'Nhật ký',
    description: 'Ai đổi gì, lúc nào, trên app nào.',
    href: '/audit',
    icon: HistoryIcon,
    status: 'available',
  },
  {
    id: 'translations',
    label: 'Chuỗi đa ngôn ngữ',
    description: 'Quản lý strings.xml nhiều ngôn ngữ. Chưa làm.',
    href: '/translations',
    icon: TranslateIcon,
    status: 'planned',
  },
  {
    id: 'metrics',
    label: 'Chỉ số quảng cáo',
    description: 'Đối chiếu cấu hình với doanh thu thực tế. Chưa làm.',
    href: '/metrics',
    icon: InsightsIcon,
    status: 'planned',
  },
  {
    id: 'admin',
    label: 'Quản trị',
    description: 'Tài khoản, app và phân quyền.',
    href: '/admin',
    icon: AdminPanelSettingsIcon,
    status: 'available',
    adminOnly: true,
  },
]

export const visibleTools = (isAdmin: boolean): readonly ToolDefinition[] =>
  TOOLS.filter((tool) => tool.adminOnly !== true || isAdmin)
