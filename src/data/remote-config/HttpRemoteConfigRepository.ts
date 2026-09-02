import { type Result, ok } from '../../core/result'
import type {
  RemoteConfigTemplate,
  VersionedTemplate,
} from '../../domain/remote-config/entities/RemoteConfigTemplate'
import type { RemoteConfigRepository } from '../../domain/remote-config/repositories/RemoteConfigRepository'
import { httpJson } from '../http/httpJson'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của cùng cổng Remote Config: gọi Route
 * Handler của chính ứng dụng, và Route Handler mới là bên gọi Firebase.
 *
 * Đây là chỗ trả công cho việc đảo phụ thuộc: `loadAdsWorkspace` và
 * `publishAdsWorkspace` không biết mình đang chạy ở đâu, nên cùng một đoạn mã
 * dùng được cho cả hai phía và cũng dùng được trong test với một adapter giả.
 */
const basePath = (appSlug: string): string => `/api/apps/${encodeURIComponent(appSlug)}/remote-config`

export class HttpRemoteConfigRepository implements RemoteConfigRepository {
  async fetchTemplate(appSlug: string, signal?: AbortSignal): Promise<Result<VersionedTemplate>> {
    const response = await httpJson<{ template: RemoteConfigTemplate; etag: string }>(
      basePath(appSlug),
      signal !== undefined ? { signal } : {},
    )
    if (!response.ok) return response
    return ok({ template: response.value.template, etag: response.value.etag })
  }

  async validateTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    signal?: AbortSignal,
  ): Promise<Result<void>> {
    const response = await httpJson<{ valid: true }>(`${basePath(appSlug)}/validate`, {
      method: 'POST',
      body: { template },
      ...(signal !== undefined ? { signal } : {}),
    })
    if (!response.ok) return response
    return ok(undefined)
  }

  async publishTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    etag: string,
    signal?: AbortSignal,
  ): Promise<Result<VersionedTemplate>> {
    const response = await httpJson<{ template: RemoteConfigTemplate; etag: string }>(basePath(appSlug), {
      method: 'PUT',
      body: { template },
      // ETag đi trong header đúng như giao thức thật, không nhét vào thân yêu cầu.
      headers: { 'If-Match': etag },
      ...(signal !== undefined ? { signal } : {}),
    })
    if (!response.ok) return response
    return ok({ template: response.value.template, etag: response.value.etag })
  }
}
