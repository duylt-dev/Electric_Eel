import { AppErrors, type Result, err, ok } from '../../core/result'
import type {
  TranslationEvent,
  TranslationOutcome,
  TranslationRequest,
} from '../../domain/translation/entities/TranslationJob'
import type { TranslationRepository } from '../../domain/translation/repositories/TranslationRepository'
import { toAppErrorFromResponse } from '../http/httpJson'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của cổng dịch chuỗi: gọi Route Handler của
 * chính ứng dụng rồi đọc luồng tiến độ nó trả về.
 *
 * Không dùng chung `httpJson` được, và đó chính là điểm khác biệt: `httpJson`
 * chờ phản hồi xong hẳn rồi mới đọc. Ở đây phản hồi kéo dài hàng phút và giá
 * trị của nó nằm ở chỗ *chảy dần* — mỗi ngôn ngữ dịch xong là một dòng NDJSON,
 * và trình duyệt vẽ ngay dòng đó lên.
 *
 * Khoá API không bao giờ xuống tới đây: Route Handler mới là bên gọi mô hình.
 */
const ENDPOINT = '/api/translations'

/** Ranh giới giữa hai sự kiện là ký tự xuống dòng, nên phải tự gom mảnh. */
const NEWLINE = '\n'

export class HttpTranslationRepository implements TranslationRepository {
  async translate(
    request: TranslationRequest,
    onEvent: (event: TranslationEvent) => void,
    signal?: AbortSignal,
  ): Promise<Result<TranslationOutcome>> {
    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify(request),
        cache: 'no-store',
        ...(signal !== undefined ? { signal } : {}),
      })
    } catch (thrown) {
      if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ lượt dịch.'))
      return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
    }

    // Lỗi phát hiện được TRƯỚC khi luồng bắt đầu (chưa đăng nhập, tệp không
    // hợp lệ, chưa cấu hình khoá) vẫn về theo đường JSON thường.
    if (!response.ok) return err(await toAppErrorFromResponse(response))

    if (response.body === null) {
      return err(AppErrors.unknown('Máy chủ không trả về nội dung nào.'))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    let outcome: TranslationOutcome | null = null

    const consume = (line: string): Result<void> | null => {
      const trimmed = line.trim()
      if (trimmed.length === 0) return null

      let event: TranslationEvent
      try {
        event = JSON.parse(trimmed) as TranslationEvent
      } catch {
        // Một dòng hỏng không đáng làm hỏng cả lượt dịch: phần thân đang chảy
        // về vẫn còn nguyên giá trị, và dòng cuối mới là dòng mang kết quả.
        console.warn('[translation] bỏ qua một dòng tiến độ không đọc được')
        return null
      }

      onEvent(event)

      if (event.type === 'finished') {
        outcome = { archive: event.archive, failed: event.failed }
      } else if (event.type === 'failed') {
        return err({
          kind: event.kind,
          message: event.message,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        })
      }
      return null
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffered += decoder.decode(value, { stream: true })

        let newline = buffered.indexOf(NEWLINE)
        while (newline >= 0) {
          const failure = consume(buffered.slice(0, newline))
          if (failure !== null) return failure as Result<TranslationOutcome>
          buffered = buffered.slice(newline + 1)
          newline = buffered.indexOf(NEWLINE)
        }
      }

      // Dòng cuối có thể không kết thúc bằng ký tự xuống dòng.
      const failure = consume(buffered)
      if (failure !== null) return failure as Result<TranslationOutcome>
    } catch (thrown) {
      if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ lượt dịch.'))
      return err(AppErrors.network('Mất kết nối giữa chừng khi đang dịch.', { cause: thrown }))
    } finally {
      reader.releaseLock()
    }

    if (outcome === null) {
      return err(
        AppErrors.unknown('Luồng kết thúc mà chưa có tệp kết quả. Thử lại; nếu vẫn vậy thì xem log máy chủ.'),
      )
    }
    return ok(outcome)
  }
}
