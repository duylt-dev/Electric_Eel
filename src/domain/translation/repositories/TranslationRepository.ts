import type { Result } from '../../../core/result'
import type { TranslationEvent, TranslationOutcome, TranslationRequest } from '../entities/TranslationJob'

/**
 * Cổng "chạy một lượt dịch", nhìn từ phía màn hình.
 *
 * ViewModel phụ thuộc vào đây chứ không phụ thuộc `fetch`: cùng một ViewModel
 * chạy được với adapter HTTP thật và với một adapter giả trong test, mà không
 * cần dựng máy chủ.
 *
 * `onEvent` là tiến độ chảy về trong lúc chạy; giá trị trả về là kết quả cuối.
 * Hai đường tách nhau vì bên gọi cần cả hai và chúng có vòng đời khác nhau.
 */
export interface TranslationRepository {
  translate(
    request: TranslationRequest,
    onEvent: (event: TranslationEvent) => void,
    signal?: AbortSignal,
  ): Promise<Result<TranslationOutcome>>
}
