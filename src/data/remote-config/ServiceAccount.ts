import { z } from 'zod'

import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Service account JSON tải từ Firebase Console.
 *
 * Chỉ kiểm những trường thật sự cần để ký token. Các trường khác giữ nguyên,
 * không lọc bỏ, để lưu lại đúng file người dùng đưa vào.
 */
const serviceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().email(),
})

export type ServiceAccount = z.infer<typeof serviceAccountSchema> & Record<string, unknown>

/**
 * `google-services.json` cũng tải từ Firebase Console và cũng là JSON, nên đây
 * là tệp bị chọn nhầm nhiều nhất. Nó không chứa khoá ký nên không bao giờ dùng
 * được; nói thẳng tên tệp ra thay vì liệt kê bốn trường thiếu, vì danh sách đó
 * không giúp người dùng biết phải quay lại tải tệp nào.
 */
function looksLikeGoogleServicesJson(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  const shape = json as Record<string, unknown>
  return 'project_info' in shape && 'client' in shape
}

export function parseServiceAccount(raw: string): Result<ServiceAccount> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return err(AppErrors.validation('Tệp không phải JSON hợp lệ.'))
  }

  if (looksLikeGoogleServicesJson(json)) {
    return err(
      AppErrors.validation(
        'Đây là google-services.json — tệp cấu hình cho app Android, không phải service account. ' +
          'Tệp cần dùng lấy ở Firebase Console › Project settings › Service accounts › Generate new ' +
          'private key, bên trong có trường "private_key".',
      ),
    )
  }

  const parsed = serviceAccountSchema.safeParse(json)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    return err(
      AppErrors.validation(
        `Không phải service account JSON hợp lệ. Kiểm tra các trường: ${missing}.`,
        { detail: parsed.error.message },
      ),
    )
  }

  return ok({ ...(json as Record<string, unknown>), ...parsed.data })
}

/**
 * Nguồn cấp credential cho một app. Cổng riêng để adapter Firebase không cần
 * biết credential được cất ở đâu — hiện là DB, sau có thể là secret manager.
 */
export interface AppCredentialProvider {
  credentialsFor(appSlug: string): Promise<Result<{ projectId: string; serviceAccount: ServiceAccount }>>
}
