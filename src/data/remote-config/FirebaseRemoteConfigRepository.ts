import { JWT } from 'google-auth-library'

import { AppErrors, type Result, err, ok } from '../../core/result'
import type {
  RemoteConfigTemplate,
  VersionedTemplate,
} from '../../domain/remote-config/entities/RemoteConfigTemplate'
import type { RemoteConfigRepository } from '../../domain/remote-config/repositories/RemoteConfigRepository'
import type { AppCredentialProvider, ServiceAccount } from './ServiceAccount'

/**
 * Hiện thực CHẠY TRÊN SERVER của cổng Remote Config: gọi thẳng Firebase Admin
 * REST API v1.
 *
 * Phải chạy trên server vì hai lý do độc lập nhau, mỗi lý do đều đủ:
 *   1. Endpoint này không trả CORS header, trình duyệt không gọi được.
 *   2. Ký được token nghĩa là nắm private key của service account. Thứ đó
 *      không bao giờ được gửi xuống trình duyệt.
 */
const SCOPE = 'https://www.googleapis.com/auth/firebase.remoteconfig'
const BASE_URL = 'https://firebaseremoteconfig.googleapis.com/v1'

/**
 * Mỗi service account chỉ cần một JWT client; google-auth-library tự nhớ
 * access token và tự làm mới trước khi hết hạn. Dựng mới mỗi lượt gọi là tự
 * bắt mình xin token lại từ đầu mỗi lần.
 */
const jwtCache = new Map<string, JWT>()

const jwtFor = (serviceAccount: ServiceAccount): JWT => {
  const cached = jwtCache.get(serviceAccount.client_email)
  if (cached !== undefined) return cached

  const jwt = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [SCOPE],
  })
  jwtCache.set(serviceAccount.client_email, jwt)
  return jwt
}

/** Xoá token đã nhớ khi credential của app thay đổi. */
export const forgetCachedCredential = (clientEmail: string): void => {
  jwtCache.delete(clientEmail)
}

interface FirebaseErrorBody {
  error?: { code?: number; message?: string; status?: string }
}

const describeFailure = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '')
  if (text.length === 0) return `HTTP ${response.status}`
  try {
    const body = JSON.parse(text) as FirebaseErrorBody
    return body.error?.message ?? text.slice(0, 500)
  } catch {
    return text.slice(0, 500)
  }
}

/** Quy mã trạng thái HTTP về loại lỗi trong miền — nơi duy nhất biết về HTTP. */
const mapHttpFailure = async (response: Response, action: string) => {
  const detail = await describeFailure(response)

  switch (response.status) {
    case 400:
      return AppErrors.validation(`Firebase từ chối nội dung: ${detail}`, { detail })
    case 401:
      return AppErrors.upstream(
        'Firebase từ chối xác thực. Service account có thể đã bị thu hồi hoặc hết hạn.',
        { detail },
      )
    case 403:
      return AppErrors.forbidden(
        'Service account không có quyền Remote Config trên project này. Cần vai trò Firebase Remote Config Admin.',
        { detail },
      )
    case 404:
      return AppErrors.notFound('Không tìm thấy project hoặc project chưa bật Remote Config.', { detail })
    case 409:
    case 412:
      return AppErrors.conflict(
        'Cấu hình trên Firebase đã thay đổi kể từ lúc bạn mở. Tải lại rồi đối chiếu trước khi đẩy lên.',
        { detail },
      )
    case 429:
      return AppErrors.upstream('Firebase đang giới hạn tần suất. Thử lại sau ít phút.', { detail })
    default:
      return AppErrors.upstream(`${action} thất bại (HTTP ${response.status}).`, { detail })
  }
}

export class FirebaseRemoteConfigRepository implements RemoteConfigRepository {
  constructor(private readonly credentials: AppCredentialProvider) {}

  private async request(
    appSlug: string,
    init: { method: 'GET' | 'PUT'; body?: string; etag?: string; validateOnly?: boolean },
    signal?: AbortSignal,
  ): Promise<Result<Response>> {
    const resolved = await this.credentials.credentialsFor(appSlug)
    if (!resolved.ok) return resolved

    const { projectId, serviceAccount } = resolved.value

    let accessToken: string | null | undefined
    try {
      accessToken = (await jwtFor(serviceAccount).getAccessToken()).token
    } catch (thrown) {
      // Token hỏng thường do private key sai; giữ lại client hỏng chỉ làm lỗi lặp lại.
      forgetCachedCredential(serviceAccount.client_email)
      return err(
        AppErrors.upstream('Không lấy được access token từ service account.', { cause: thrown }),
      )
    }
    if (accessToken === null || accessToken === undefined) {
      return err(AppErrors.upstream('Google trả về access token rỗng.'))
    }

    const url = new URL(`${BASE_URL}/projects/${encodeURIComponent(projectId)}/remoteConfig`)
    if (init.validateOnly === true) url.searchParams.set('validate_only', 'true')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Encoding': 'gzip',
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json; UTF-8'
    if (init.etag !== undefined) headers['If-Match'] = init.etag

    try {
      const response = await fetch(url, {
        method: init.method,
        headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
        ...(signal !== undefined ? { signal } : {}),
        cache: 'no-store',
      })
      return ok(response)
    } catch (thrown) {
      if (signal?.aborted === true) return err(AppErrors.cancelled('Thao tác đã bị huỷ.'))
      return err(AppErrors.network('Không kết nối được tới Firebase.', { cause: thrown }))
    }
  }

  async fetchTemplate(appSlug: string, signal?: AbortSignal): Promise<Result<VersionedTemplate>> {
    const response = await this.request(appSlug, { method: 'GET' }, signal)
    if (!response.ok) return response

    if (!response.value.ok) return err(await mapHttpFailure(response.value, 'Tải cấu hình'))

    const etag = response.value.headers.get('etag')
    if (etag === null || etag.length === 0) {
      // Không có ETag thì không thể ghi an toàn. Thà dừng còn hơn ghi mù.
      return err(
        AppErrors.upstream(
          'Firebase không trả về ETag, nên không thể ghi lại an toàn. Thử tải lại.',
        ),
      )
    }

    try {
      const template = (await response.value.json()) as RemoteConfigTemplate
      return ok({ template, etag })
    } catch (thrown) {
      return err(AppErrors.upstream('Firebase trả về nội dung không đọc được.', { cause: thrown }))
    }
  }

  async validateTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    signal?: AbortSignal,
  ): Promise<Result<void>> {
    // `If-Match: *` chỉ chấp nhận được ở đây, vì validate_only không ghi gì cả.
    const response = await this.request(
      appSlug,
      { method: 'PUT', body: JSON.stringify(template), etag: '*', validateOnly: true },
      signal,
    )
    if (!response.ok) return response
    if (!response.value.ok) return err(await mapHttpFailure(response.value, 'Kiểm tra cấu hình'))
    return ok(undefined)
  }

  async publishTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    etag: string,
    signal?: AbortSignal,
  ): Promise<Result<VersionedTemplate>> {
    if (etag.length === 0 || etag === '*') {
      // Chặn ngay tại đây thay vì tin vào phía gọi: `*` nghĩa là "ghi đè bất kể
      // ai vừa sửa gì", và hậu quả là mất trắng công của người khác.
      return err(
        AppErrors.validation(
          'Thiếu ETag hợp lệ. Tải lại cấu hình rồi thử lại — không được ghi đè khi chưa biết mình đang ghi đè lên bản nào.',
        ),
      )
    }

    const response = await this.request(
      appSlug,
      { method: 'PUT', body: JSON.stringify(template), etag },
      signal,
    )
    if (!response.ok) return response
    if (!response.value.ok) return err(await mapHttpFailure(response.value, 'Đẩy cấu hình lên Firebase'))

    const nextEtag = response.value.headers.get('etag') ?? etag
    try {
      const published = (await response.value.json()) as RemoteConfigTemplate
      return ok({ template: published, etag: nextEtag })
    } catch (thrown) {
      return err(AppErrors.upstream('Đã publish nhưng không đọc được phản hồi.', { cause: thrown }))
    }
  }
}
