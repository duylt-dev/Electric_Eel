import type { AdUnit, AdmobIdDocument } from '../entities/AdmobIdDocument'
import type { AdPlacement, ShowAdsDocument } from '../entities/ShowAdsDocument'
import type { Finding } from './Finding'

export interface ValidationOptions {
  /**
   * Có xét cả vị trí đang tắt hay không. Mặc định là không: một vị trí đã tắt
   * mà cấu hình chưa đủ thì chưa gây hậu quả gì, báo lên chỉ thành nhiễu.
   */
  includeDisabled: boolean
}

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = { includeDisabled: false }

/**
 * Bối cảnh dựng sẵn một lần rồi dùng chung cho mọi luật.
 *
 * Ghép `spaceName` với `configName` là phép O(n·m); để mỗi luật tự ghép thì
 * vừa chậm vừa dễ có luật ghép sai kiểu (đã từng xảy ra: khớp tiền tố ngắn
 * nhất làm `demo_native` nuốt mất `demo_native_full_screen`).
 */
export interface ValidationContext {
  readonly admob: AdmobIdDocument | null
  readonly showAds: ShowAdsDocument | null
  readonly options: ValidationOptions

  readonly placements: readonly AdPlacement[]
  readonly adUnits: readonly AdUnit[]
  readonly placementByName: ReadonlyMap<string, AdPlacement>
  /** Các ad unit thuộc về một vị trí, theo khớp tiền tố dài nhất. */
  readonly unitsByConfigName: ReadonlyMap<string, readonly AdUnit[]>
  /** Ad unit không khớp được vị trí nào. */
  readonly orphanUnits: readonly AdUnit[]
  /** Vị trí đang được xét, sau khi lọc theo `includeDisabled`. */
  readonly activePlacements: readonly AdPlacement[]
}

export interface ValidationRule {
  readonly code: string
  /** Tên hiển thị của luật, dùng trong bảng thống kê. */
  readonly title: string
  run(context: ValidationContext): Finding[]
}
