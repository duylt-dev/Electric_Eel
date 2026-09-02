import { AppErrors, type Result, attempt, err, ok } from '../../core/result'
import type { AdmobIdDocument } from './entities/AdmobIdDocument'
import type { ShowAdsDocument } from './entities/ShowAdsDocument'

/**
 * Đọc và ghi hai tài liệu JSON nằm bên trong giá trị tham số Remote Config.
 *
 * ─── Quy tắc bất di bất dịch: KHÔNG LÀM MẤT TRƯỜNG ───
 *
 * Bộ đọc ở đây cố tình dễ dãi. Trường lạ được giữ nguyên chứ không bị lọc bỏ.
 * Lý do: file thật có những khoá SDK không đọc nhưng con người thì có đọc — ví
 * dụ năm mảng `listTemplate*` dùng làm danh mục tra cứu. Một bộ đọc chặt chẽ
 * kiểu Zod `.strict()` sẽ âm thầm xoá chúng ở lần lưu đầu tiên, và người viết
 * ra chúng không bao giờ biết mình đã mất gì.
 *
 * Việc chỉ ra trường nào là rác thuộc về bộ kiểm tra (`validation/`), nơi kết
 * quả được TRÌNH BÀY cho người dùng quyết định — chứ không phải nơi đọc file
 * tự ý quyết định thay.
 */

const parseJsonObject = (raw: string, label: string): Result<Record<string, unknown>> => {
  if (raw.trim().length === 0) {
    return err(AppErrors.validation(`${label} đang rỗng.`))
  }
  const parsed = attempt(() => JSON.parse(raw) as unknown, `${label} không phải JSON hợp lệ.`)
  if (!parsed.ok) {
    return err(
      AppErrors.validation(`${label} không phải JSON hợp lệ.`, {
        detail: parsed.error.detail ?? parsed.error.message,
      }),
    )
  }
  if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return err(AppErrors.validation(`${label} phải là một đối tượng JSON.`))
  }
  return ok(parsed.value as Record<string, unknown>)
}

export function parseAdmobIdDocument(raw: string): Result<AdmobIdDocument> {
  const parsed = parseJsonObject(raw, 'admob_id')
  if (!parsed.ok) return parsed
  const value = parsed.value

  if (!Array.isArray(value.listAds)) {
    return err(AppErrors.validation('admob_id thiếu mảng "listAds".'))
  }

  return ok({
    ...value,
    network: typeof value.network === 'string' ? value.network : 'google',
    appId: typeof value.appId === 'string' ? value.appId : '',
    package: typeof value.package === 'string' ? value.package : '',
    listAds: value.listAds as AdmobIdDocument['listAds'],
  } as AdmobIdDocument)
}

export function parseShowAdsDocument(raw: string): Result<ShowAdsDocument> {
  const parsed = parseJsonObject(raw, 'config_show_ads')
  if (!parsed.ok) return parsed
  const value = parsed.value

  if (!Array.isArray(value.listConfig)) {
    return err(AppErrors.validation('config_show_ads thiếu mảng "listConfig".'))
  }

  return ok({
    ...value,
    listConfig: value.listConfig as ShowAdsDocument['listConfig'],
  } as ShowAdsDocument)
}

export interface SerializeOptions {
  /**
   * Xuống dòng và thụt lề cho người đọc. Mặc định là không: giá trị gửi lên
   * Firebase nên gọn nhất có thể vì mỗi thiết bị đều phải tải nó về.
   */
  pretty?: boolean
}

const stringify = (document: unknown, options: SerializeOptions = {}): string =>
  options.pretty === true ? JSON.stringify(document, null, 2) : JSON.stringify(document)

/**
 * Thứ tự khoá được giữ nguyên theo thứ tự chèn của JavaScript, nên tài liệu
 * đọc vào rồi ghi ra mà không sửa gì sẽ cho lại đúng chuỗi ban đầu. Nhờ vậy
 * bản so sánh trước khi publish chỉ hiện đúng những dòng thật sự thay đổi.
 */
export const serializeAdmobIdDocument = (document: AdmobIdDocument, options?: SerializeOptions): string =>
  stringify(document, options)

export const serializeShowAdsDocument = (document: ShowAdsDocument, options?: SerializeOptions): string =>
  stringify(document, options)

/** Khoá tham số Remote Config mà tool này có form dựng sẵn. */
export const ADMOB_ID_PARAMETER_KEY = 'admob_id'
export const CONFIG_SHOW_ADS_PARAMETER_KEY = 'config_show_ads'

export const BUILT_IN_PARAMETER_KEYS: readonly string[] = [
  ADMOB_ID_PARAMETER_KEY,
  CONFIG_SHOW_ADS_PARAMETER_KEY,
]
