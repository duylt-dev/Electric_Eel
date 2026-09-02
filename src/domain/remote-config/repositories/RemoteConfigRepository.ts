import type { Result } from '../../../core/result'
import type { RemoteConfigTemplate, VersionedTemplate } from '../entities/RemoteConfigTemplate'

/**
 * Cổng ra Remote Config.
 *
 * Tách đọc và ghi thành hai giao diện là cố ý (Interface Segregation): màn hình
 * chỉ-xem của người có quyền VIEWER chỉ cần `RemoteConfigReader`, nên nó không
 * thể vô tình gọi `publish` — và người đọc code thấy ngay điều đó qua kiểu.
 *
 * Có hai hiện thực cho cùng bộ cổng này:
 *   · `FirebaseRemoteConfigRepository`  chạy trên server, gọi Admin REST API.
 *   · `HttpRemoteConfigRepository`      chạy trên trình duyệt, gọi Route Handler.
 *
 * Phải tách làm hai vì Firebase Admin API không có CORS: trình duyệt không gọi
 * thẳng được, và service account thì tuyệt đối không được rời khỏi server.
 */
export interface RemoteConfigReader {
  /** Lấy template hiện hành kèm ETag để dùng cho lần ghi sau. */
  fetchTemplate(appSlug: string, signal?: AbortSignal): Promise<Result<VersionedTemplate>>
}

export interface RemoteConfigWriter {
  /**
   * Nhờ chính Firebase kiểm tra template mà không ghi gì
   * (`?validate_only=true`). Đây là cách duy nhất chắc chắn để biết một biểu
   * thức điều kiện có hợp lệ hay không — cú pháp đó là của họ.
   */
  validateTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    signal?: AbortSignal,
  ): Promise<Result<void>>

  /**
   * Ghi đè template. `etag` lấy từ lần `fetchTemplate` gần nhất và được gửi
   * kèm dưới dạng `If-Match`.
   *
   * Lệch ETag trả về lỗi `conflict`, KHÔNG được tự ý thử lại với `If-Match: *`
   * — làm vậy là xoá sạch thay đổi của người vừa publish trước mà không ai hay.
   */
  publishTemplate(
    appSlug: string,
    template: RemoteConfigTemplate,
    etag: string,
    signal?: AbortSignal,
  ): Promise<Result<VersionedTemplate>>
}

export interface RemoteConfigRepository extends RemoteConfigReader, RemoteConfigWriter {}
