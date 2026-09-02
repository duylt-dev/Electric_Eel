import { type Result, ok } from '../../../core/result'
import type { RemoteConfigReader } from '../../remote-config/repositories/RemoteConfigRepository'
import { buildAdsWorkspace } from '../AdsWorkspace'
import type { AdsWorkspace } from '../AdsWorkspace'

export interface LoadAdsWorkspaceDeps {
  remoteConfig: RemoteConfigReader
}

/**
 * Tải cấu hình quảng cáo của một app và dựng thành không gian làm việc.
 *
 * Chỉ nhận `RemoteConfigReader`, không nhận cả repository: use case này không
 * ghi gì, và kiểu của nó nói ra điều đó.
 */
export async function loadAdsWorkspace(
  deps: LoadAdsWorkspaceDeps,
  params: { appSlug: string },
  signal?: AbortSignal,
): Promise<Result<AdsWorkspace>> {
  const fetched = await deps.remoteConfig.fetchTemplate(params.appSlug, signal)
  if (!fetched.ok) return fetched

  return ok(buildAdsWorkspace(params.appSlug, fetched.value.template, fetched.value.etag))
}
