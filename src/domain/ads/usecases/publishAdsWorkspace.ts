import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { RemoteConfigRepository } from '../../remote-config/repositories/RemoteConfigRepository'
import { applyWorkspaceToTemplate, buildAdsWorkspace, worstSeverity } from '../AdsWorkspace'
import type { AdsWorkspace } from '../AdsWorkspace'

export interface PublishAdsWorkspaceDeps {
  remoteConfig: RemoteConfigRepository
}

export interface PublishAdsWorkspaceParams {
  workspace: AdsWorkspace
  /**
   * Người dùng đã đọc và chấp nhận các cảnh báo. Không có cờ này thì cảnh báo
   * cũng chặn publish.
   *
   * Lỗi thì KHÔNG có cờ nào bỏ qua được: chúng đều là những thứ đã chứng minh
   * được là gây hậu quả — mất doanh thu, quảng cáo không hiện, SDK đọc sai.
   */
  acknowledgeWarnings?: boolean
}

/**
 * Đẩy cấu hình lên Firebase.
 *
 * Bốn cửa, theo đúng thứ tự này:
 *   1. Bộ luật nội bộ — bắt được thứ Firebase không biết (lệch tham chiếu giữa
 *      hai tham số, tên trường Gson bỏ qua, ID quảng cáo thử).
 *   2. `validate_only` của chính Firebase — bắt được thứ ta không biết, đặc
 *      biệt là cú pháp biểu thức điều kiện.
 *   3. Ghi kèm `If-Match` — chặn ghi đè lên công của người khác.
 *   4. Trả về không gian làm việc mới dựng từ phản hồi thật, không phải từ
 *      thứ ta vừa gửi đi.
 */
export async function publishAdsWorkspace(
  deps: PublishAdsWorkspaceDeps,
  params: PublishAdsWorkspaceParams,
  signal?: AbortSignal,
): Promise<Result<AdsWorkspace>> {
  const { workspace } = params

  const severity = worstSeverity(workspace)
  if (severity === 'error') {
    return err(
      AppErrors.validation(
        'Còn lỗi chưa xử lý. Sửa hết lỗi rồi mới đẩy lên được — mỗi lỗi trong danh sách đều đã được chứng minh là gây hậu quả thật.',
      ),
    )
  }
  if (severity === 'warning' && params.acknowledgeWarnings !== true) {
    return err(
      AppErrors.validation(
        'Còn cảnh báo chưa được xác nhận. Đọc qua rồi tích vào ô xác nhận nếu bạn cố ý để như vậy.',
      ),
    )
  }

  const template = applyWorkspaceToTemplate(workspace)

  const validated = await deps.remoteConfig.validateTemplate(workspace.appSlug, template, signal)
  if (!validated.ok) return validated

  const published = await deps.remoteConfig.publishTemplate(
    workspace.appSlug,
    template,
    workspace.etag,
    signal,
  )
  if (!published.ok) return published

  return ok(buildAdsWorkspace(workspace.appSlug, published.value.template, published.value.etag))
}
