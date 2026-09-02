/**
 * Hình dạng của một Remote Config template theo Firebase Admin REST API v1.
 *
 * Tham chiếu: GET/PUT https://firebaseremoteconfig.googleapis.com/v1/projects/{id}/remoteConfig
 *
 * Tất cả giá trị tham số đều là CHUỖI. Một tham số kiểu JSON như
 * `config_show_ads` thực chất là một chuỗi chứa JSON — đó là lý do trên console
 * Firebase nó hiện ra thành một khối chữ dày đặc, và cũng là lý do có tool này.
 */

export type TagColor =
  | 'CONDITION_DISPLAY_COLOR_UNSPECIFIED'
  | 'BLUE'
  | 'BROWN'
  | 'CYAN'
  | 'DEEP_ORANGE'
  | 'GREEN'
  | 'INDIGO'
  | 'LIME'
  | 'ORANGE'
  | 'PINK'
  | 'PURPLE'
  | 'TEAL'

export const TAG_COLORS: readonly TagColor[] = [
  'BLUE',
  'BROWN',
  'CYAN',
  'DEEP_ORANGE',
  'GREEN',
  'INDIGO',
  'LIME',
  'ORANGE',
  'PINK',
  'PURPLE',
  'TEAL',
]

export type ParameterValueType = 'PARAMETER_VALUE_TYPE_UNSPECIFIED' | 'STRING' | 'BOOLEAN' | 'NUMBER' | 'JSON'

/**
 * Giá trị của một tham số. Đây là union phân biệt bằng trường có mặt:
 * hoặc có `value`, hoặc `useInAppDefault`, chứ không phải cả hai.
 */
export type RemoteConfigParameterValue =
  | { value: string }
  | { useInAppDefault: true }
  | { personalizationValue: { personalizationId: string } }
  | { rolloutValue: { rolloutId: string; value: string; percent: number } }

export const isExplicitValue = (
  value: RemoteConfigParameterValue | undefined,
): value is { value: string } => value !== undefined && 'value' in value

export const isUseInAppDefault = (
  value: RemoteConfigParameterValue | undefined,
): value is { useInAppDefault: true } => value !== undefined && 'useInAppDefault' in value

export interface RemoteConfigParameter {
  defaultValue?: RemoteConfigParameterValue
  /** Khoá là TÊN điều kiện, phải khớp một phần tử trong `conditions`. */
  conditionalValues?: Record<string, RemoteConfigParameterValue>
  description?: string
  valueType?: ParameterValueType
}

export interface RemoteConfigCondition {
  name: string
  /** Biểu thức theo cú pháp riêng của Firebase. Xem ConditionExpression.ts. */
  expression: string
  tagColor?: TagColor
}

export interface RemoteConfigParameterGroup {
  description?: string
  parameters: Record<string, RemoteConfigParameter>
}

export interface RemoteConfigVersion {
  versionNumber?: string
  updateTime?: string
  updateUser?: { email?: string; name?: string; imageUrl?: string }
  description?: string
  updateOrigin?: string
  updateType?: string
}

export interface RemoteConfigTemplate {
  /**
   * THỨ TỰ CÓ Ý NGHĨA. Với một tham số, Firebase lấy giá trị của điều kiện
   * ĐẦU TIÊN khớp theo đúng thứ tự mảng này. Đảo thứ tự là đổi hành vi.
   */
  conditions?: RemoteConfigCondition[]
  parameters?: Record<string, RemoteConfigParameter>
  parameterGroups?: Record<string, RemoteConfigParameterGroup>
  version?: RemoteConfigVersion
  etag?: string
}

/**
 * Template kèm ETag đọc được từ header `ETag` của lần GET.
 *
 * ETag là công cụ chống ghi đè: PUT phải kèm `If-Match: <etag>`, Firebase trả
 * 409 nếu bản trên server đã đổi. KHÔNG bao giờ gửi `If-Match: *` — nó tắt
 * đúng cái cơ chế đang bảo vệ mình, và công việc của người publish trước đó
 * biến mất không dấu vết.
 */
export interface VersionedTemplate {
  template: RemoteConfigTemplate
  etag: string
}

/** Giới hạn cứng của Firebase, cần cho việc kiểm tra trước khi publish. */
export const REMOTE_CONFIG_LIMITS = {
  maxParameters: 2000,
  maxConditions: 500,
  maxParameterKeyLength: 256,
  /** Firebase giữ 300 phiên bản gần nhất, tối đa 90 ngày. */
  versionHistoryCount: 300,
  versionHistoryDays: 90,
} as const

/** Khoá tham số hợp lệ: bắt đầu bằng chữ hoặc `_`, sau đó chữ/số/`_`. */
export const PARAMETER_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export const listParameterKeys = (template: RemoteConfigTemplate): string[] => [
  ...Object.keys(template.parameters ?? {}),
  ...Object.values(template.parameterGroups ?? {}).flatMap((group) => Object.keys(group.parameters)),
]

/** Tìm một tham số dù nó nằm ở cấp gốc hay trong một nhóm. */
export function findParameter(
  template: RemoteConfigTemplate,
  key: string,
): { parameter: RemoteConfigParameter; groupName: string | null } | null {
  const direct = template.parameters?.[key]
  if (direct) return { parameter: direct, groupName: null }

  for (const [groupName, group] of Object.entries(template.parameterGroups ?? {})) {
    const inGroup = group.parameters[key]
    if (inGroup) return { parameter: inGroup, groupName }
  }
  return null
}
