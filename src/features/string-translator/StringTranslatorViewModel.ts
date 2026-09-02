import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { SUPPORTED_LANGUAGES } from '@/domain/translation/entities/LanguageCode'
import type { TranslationRepository } from '@/domain/translation/repositories/TranslationRepository'
import { validateStringsXml } from '@/domain/translation/validation/validateStringsXml'
import { canTranslate, initialStringTranslatorState } from './StringTranslatorContract'
import type {
  StringTranslatorEffect,
  StringTranslatorIntent,
  StringTranslatorState,
} from './StringTranslatorContract'

/**
 * ViewModel của màn dịch chuỗi.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Việc tải tệp về là Effect, không phải lời gọi thẳng vào `document`.
 *
 * Phần soi tệp chạy NGAY tại trình duyệt, không gửi lên máy chủ. Người dùng
 * biết tệp hỏng ở đâu trong vài mili giây thay vì sau một vòng gọi mạng, và
 * cùng bộ luật đó vẫn chạy lại lần nữa ở Route Handler — bên này là màn hình,
 * không phải hàng rào.
 */
export interface StringTranslatorDeps {
  translation: TranslationRepository
}

type Context = IntentContext<StringTranslatorState, StringTranslatorEffect>

/** Đúng thứ tự trong danh sách hỗ trợ, để chọn/bỏ chọn không xáo trộn thứ tự. */
const inCanonicalOrder = (codes: readonly string[]): string[] =>
  SUPPORTED_LANGUAGES.filter((language) => codes.includes(language.code)).map(
    (language) => language.code,
  )

function pickFile(ctx: Context, fileName: string, content: string): void {
  const report = validateStringsXml(content)

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    fileName,
    xml: content,
    report,
    // Chọn tệp mới là bắt đầu lại: giữ lại tệp zip của lượt trước thì nút tải
    // về vẫn bấm được và người dùng tải nhầm bản cũ mà không có gì báo.
    archive: null,
    failed: [],
    finished: [],
    running: 0,
    error: null,
  }))

  if (!report.acceptable) {
    const errors = report.findings.filter((finding) => finding.severity === 'error').length
    ctx.emit({
      type: 'ShowMessage',
      severity: 'error',
      message: `Tệp có ${errors} lỗi phải sửa trước khi dịch.`,
    })
    return
  }

  ctx.emit({
    type: 'ShowMessage',
    severity: 'success',
    message: `Đã nạp ${report.translatableCount} chuỗi từ ${fileName}.`,
  })
}

async function translate(ctx: Context, deps: StringTranslatorDeps): Promise<void> {
  const state = ctx.getState()
  if (state.xml === null || !canTranslate(state)) return

  ctx.setState((current) => ({
    ...current,
    status: 'translating',
    running: current.selected.length,
    finished: [],
    failed: [],
    archive: null,
    error: null,
  }))

  const outcome = await deps.translation.translate(
    {
      fileName: state.fileName ?? 'strings.xml',
      xml: state.xml,
      appName: state.appName.trim(),
      languages: state.selected,
    },
    (event) => {
      // Tiến độ chỉ được ghi khi lượt này còn sống. Không có chốt chặn này thì
      // một lượt đã huỷ vẫn vẽ tiếp lên màn hình của lượt mới.
      if (ctx.signal.aborted) return
      if (event.type === 'language') {
        ctx.setState((current) => ({
          ...current,
          finished: [
            ...current.finished,
            {
              code: event.code,
              ok: event.ok,
              ...(event.message !== undefined ? { message: event.message } : {}),
            },
          ],
        }))
      }
    },
    ctx.signal,
  )

  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    ctx.setState((current) => ({ ...current, status: 'failed', error: outcome.error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    return
  }

  ctx.setState((current) => ({
    ...current,
    status: 'done',
    archive: outcome.value.archive,
    failed: outcome.value.failed,
  }))

  const failedCount = outcome.value.failed.length
  ctx.emit({
    type: 'ShowMessage',
    severity: failedCount === 0 ? 'success' : 'info',
    message:
      failedCount === 0
        ? 'Dịch xong. Bấm "Tải tệp .zip" để lưu về máy.'
        : `Dịch xong, ${failedCount} ngôn ngữ chưa trọn vẹn. Xem danh sách bên dưới rồi chạy lại riêng những ngôn ngữ đó.`,
  })
}

export const StringTranslatorViewModel = defineViewModel<
  StringTranslatorState,
  StringTranslatorIntent,
  StringTranslatorEffect,
  StringTranslatorDeps
>({
  name: 'StringTranslator',

  initialState: () => initialStringTranslatorState,

  /**
   * Cả `TranslateRequested` và `TranslationCancelled` cùng mang khoá
   * `translate`, và đó chính là cơ chế huỷ: intent mới cùng khoá huỷ intent cũ.
   * Nhờ vậy không cần giữ một `AbortController` nào trong state, và bấm "Dịch"
   * hai lần liên tiếp cũng không bao giờ chạy hai lượt chồng nhau.
   */
  intentKey: (intent) =>
    intent.type === 'TranslateRequested' || intent.type === 'TranslationCancelled'
      ? 'translate'
      : undefined,

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  handleIntent: async (intent, ctx, deps) => {
    switch (intent.type) {
      case 'FilePicked':
        pickFile(ctx, intent.fileName, intent.content)
        return

      case 'FileCleared':
        ctx.setState((state) => ({
          ...initialStringTranslatorState,
          // Hai thứ này là lựa chọn của người dùng chứ không thuộc về tệp, nên
          // chọn tệp khác không được xoá chúng đi.
          appName: state.appName,
          selected: state.selected,
        }))
        return

      case 'AppNameChanged':
        ctx.setState((state) => ({ ...state, appName: intent.value }))
        return

      case 'LanguageToggled':
        ctx.setState((state) => ({
          ...state,
          selected: inCanonicalOrder(
            state.selected.includes(intent.code)
              ? state.selected.filter((code) => code !== intent.code)
              : [...state.selected, intent.code],
          ),
        }))
        return

      case 'AllLanguagesToggled':
        ctx.setState((state) => ({
          ...state,
          selected: intent.value ? SUPPORTED_LANGUAGES.map((language) => language.code) : [],
        }))
        return

      case 'TranslateRequested':
        await translate(ctx, deps)
        return

      case 'TranslationCancelled':
        // Lượt đang chạy đã bị huỷ bởi chính khoá intent trước khi tới đây;
        // ở đây chỉ còn việc đưa màn hình về trạng thái bấm lại được.
        ctx.setState((state) => ({
          ...state,
          status: state.xml === null ? 'idle' : 'ready',
          running: 0,
          finished: [],
        }))
        ctx.emit({ type: 'ShowMessage', severity: 'info', message: 'Đã dừng lượt dịch.' })
        return

      case 'DownloadRequested': {
        const { archive } = ctx.getState()
        if (archive === null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chưa có tệp nào để tải.' })
          return
        }
        ctx.emit({
          type: 'DownloadArchive',
          fileName: archive.fileName,
          base64: archive.base64,
        })
        return
      }
    }
  },

  createDependencies: (): StringTranslatorDeps => ({ translation: clientContainer.translation }),
})
