/**
 * Hình dạng dữ liệu đi qua dây giữa trình duyệt và máy chủ cho một lượt dịch.
 *
 * Để ở domain thay vì ở data hay ở route: cả hai phía đều dùng chung kiểu này,
 * nên nó không thuộc về bên nào cả. Đổi một trường ở đây là trình biên dịch
 * bắt cả hai đầu sửa theo — đó là điểm khác biệt so với việc mỗi bên tự khai
 * một interface trông giống nhau.
 */
import type { AppErrorKind } from '../../../core/result'

export interface TranslationRequest {
  /** Tên tệp người dùng chọn. Chỉ dùng để đặt tên tệp zip trả về. */
  readonly fileName: string
  readonly xml: string
  /**
   * Tên dòng app, đưa vào prompt làm ngữ cảnh. "Rate" trong một app đo nhịp tim
   * và trong một app cho vay là hai từ khác nhau ở gần như mọi ngôn ngữ.
   */
  readonly appName: string
  readonly languages: readonly string[]
}

export interface TranslatedArchive {
  readonly fileName: string
  /**
   * Nội dung tệp zip, mã hoá base64.
   *
   * Vì sao base64 chứ không phải một phản hồi nhị phân: cùng một kết nối vừa
   * chở tiến độ theo dòng vừa chở tệp kết quả. Tách làm hai lượt gọi thì phải
   * giữ kết quả ở đâu đó giữa hai lượt — tức là dựng một kho việc trên máy chủ
   * cho một thao tác chỉ kéo dài vài phút và không cần sống qua lần khởi động lại.
   */
  readonly base64: string
  readonly byteLength: number
}

export interface LanguageFailure {
  readonly code: string
  readonly message: string
}

/**
 * Một dòng trong luồng NDJSON máy chủ trả về.
 *
 * Một lượt dịch là 28 ngôn ngữ nhân nhiều mẻ, kéo dài hàng phút. Không có
 * luồng này thì trình duyệt ngồi trước một kết nối im lặng — người dùng không
 * biết nó đang chạy hay đã treo, và các proxy đứng giữa có xu hướng cắt những
 * kết nối không có gì chảy qua.
 */
export type TranslationEvent =
  | { readonly type: 'started'; readonly languages: readonly string[]; readonly chunks: number }
  | { readonly type: 'language'; readonly code: string; readonly ok: boolean; readonly message?: string }
  | {
      readonly type: 'finished'
      readonly archive: TranslatedArchive
      readonly failed: readonly LanguageFailure[]
    }
  | {
      readonly type: 'failed'
      readonly kind: AppErrorKind
      readonly message: string
      readonly detail?: string
    }

export interface TranslationOutcome {
  readonly archive: TranslatedArchive
  readonly failed: readonly LanguageFailure[]
}
