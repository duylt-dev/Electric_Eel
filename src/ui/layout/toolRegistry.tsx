import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import HistoryIcon from '@mui/icons-material/History'
import TerminalIcon from '@mui/icons-material/Terminal'
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

/**
 * Khối công việc mà một công cụ phục vụ.
 *
 * Đây **không phải quyền truy cập**, kể cả khối `admin`: nó chỉ trả lời câu hỏi
 * "cái nào là của tôi" khi danh sách dài ra. Thứ thật sự giấu một công cụ đi là
 * cờ `adminOnly`, và ngay cả cờ đó cũng mới chỉ giấu khỏi menu — muốn chặn thì
 * phải chặn ở route và server action, vì ẩn một mục trong menu không ngăn được
 * ai gõ thẳng URL.
 */
export type ToolAudience = 'product' | 'business' | 'backoffice' | 'admin'

export interface AudienceDefinition {
  id: ToolAudience
  label: string
  description: string
}

/** Thứ tự ở đây là thứ tự các nhóm hiện trên thanh điều hướng. */
export const AUDIENCES: readonly AudienceDefinition[] = [
  {
    id: 'product',
    label: 'Khối sản xuất',
    description: 'Dev, QC, BA/PO — dựng bản build và kiểm thử.',
  },
  {
    id: 'business',
    label: 'Khối kinh doanh',
    description: 'Marketing và vận hành doanh thu.',
  },
  {
    id: 'backoffice',
    label: 'Back office',
    description: 'Vận hành, đối soát. Chưa có công cụ nào — để chỗ sẵn.',
  },
  {
    id: 'admin',
    label: 'Quản trị viên',
    description: 'Chỉ ADMIN thấy: phân quyền và truy vết thao tác.',
  },
]

export interface ToolDefinition {
  id: string
  label: string
  description: string
  href: string
  icon: SvgIconComponent
  status: ToolStatus
  /**
   * Các khối dùng công cụ này. Một công cụ phục vụ hai khối thì khai cả hai và
   * nó hiện ở cả hai nhóm — thà lặp một dòng còn hơn để marketing không tìm ra
   * Remote Config vì nó bị xếp vào mục của dev.
   */
  audiences: readonly ToolAudience[]
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
    audiences: ['product', 'business'],
  },
  {
    id: 'audit',
    label: 'Nhật ký',
    description: 'Ai đổi gì, lúc nào, trên app nào.',
    href: '/audit',
    icon: HistoryIcon,
    status: 'available',
    audiences: ['admin'],
    adminOnly: true,
  },
  {
    id: 'translations',
    label: 'Dịch',
    description: 'Nạp strings.xml, dịch sang nhiều ngôn ngữ, tải về một tệp zip.',
    href: '/translations',
    icon: TranslateIcon,
    status: 'available',
    audiences: ['product'],
  },
  {
    id: 'logcat',
    label: 'Logcat',
    description: 'Chọn máy, chọn app, xem log của riêng app đó — không lẫn log máy.',
    href: '/logcat',
    icon: TerminalIcon,
    status: 'available',
    audiences: ['product'],
  },
  {
    id: 'metrics',
    label: 'Chỉ số quảng cáo',
    description: 'Đối chiếu cấu hình với doanh thu thực tế. Chưa làm.',
    href: '/metrics',
    icon: InsightsIcon,
    status: 'planned',
    audiences: ['business'],
  },
  {
    id: 'admin',
    label: 'Quản trị',
    description: 'Tài khoản, app và phân quyền.',
    href: '/admin',
    icon: AdminPanelSettingsIcon,
    status: 'available',
    audiences: ['admin'],
    adminOnly: true,
  },
]

export const visibleTools = (isAdmin: boolean): readonly ToolDefinition[] =>
  TOOLS.filter((tool) => tool.adminOnly !== true || isAdmin)

export interface ToolGroup {
  audience: AudienceDefinition
  tools: readonly ToolDefinition[]
}

/**
 * Khối chưa có công cụ nào trong `TOOLS` — chỗ để dành cho sau này.
 *
 * Phân biệt được hai kiểu rỗng mới hiện đúng: khối để dành thì vẫn hiện kèm
 * ghi chú "chưa có công cụ", còn khối rỗng vì người dùng không đủ quyền thì
 * phải biến mất — hiện tiêu đề "Quản trị viên" cho một người không phải admin
 * chỉ nói cho họ biết có thứ họ không được xem.
 */
const isReserved = (audience: ToolAudience): boolean =>
  TOOLS.every((tool) => !tool.audiences.includes(audience))

/** Xếp công cụ thấy được vào từng khối. */
export const toolGroups = (isAdmin: boolean): readonly ToolGroup[] => {
  const tools = visibleTools(isAdmin)

  return AUDIENCES.map((audience) => ({
    audience,
    tools: tools.filter((tool) => tool.audiences.includes(audience.id)),
  })).filter((group) => group.tools.length > 0 || isReserved(group.audience.id))
}
