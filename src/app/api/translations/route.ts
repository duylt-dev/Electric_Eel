import { buildZipArchive } from '@/data/translation/ZipArchive'
import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { findLanguage } from '@/domain/translation/entities/LanguageCode'
import type { LanguageOption } from '@/domain/translation/entities/LanguageCode'
import type { TranslationEvent, TranslationRequest } from '@/domain/translation/entities/TranslationJob'
import { translateStringsFile } from '@/domain/translation/usecases/translateStringsFile'
import { MAX_SOURCE_BYTES, validateStringsXml } from '@/domain/translation/validation/validateStringsXml'
import { jsonError, readJsonBody } from '@/lib/api/response'
import { requestInfo } from '@/lib/requestInfo'
import { requireUser } from '@/lib/session'

/**
 * Chạy một lượt dịch và trả về tệp zip.
 *
 * ─── Vì sao là luồng NDJSON chứ không phải một phản hồi nhị phân ───
 *
 * Một lượt là hàng chục ngôn ngữ nhân số mẻ, kéo dài vài phút. Một phản hồi
 * duy nhất trả về ở cuối có hai vấn đề, và vấn đề thứ hai mới là vấn đề thật:
 *
 *   1. Người dùng ngồi trước một vòng quay không biết còn bao lâu.
 *   2. Kết nối không có gì chảy qua trong vài phút bị proxy và load balancer
 *      cắt. Lượt dịch vẫn chạy tới cùng trên máy chủ rồi ném kết quả đi.
 *
 * Mỗi ngôn ngữ xong là một dòng JSON chảy về — vừa là tiến độ để vẽ, vừa là
 * nhịp giữ cho kết nối sống. Dòng cuối cùng mang tệp zip mã hoá base64.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Trần số ngôn ngữ mỗi lượt. Đủ cho cả danh sách, chặn được yêu cầu viết tay. */
const MAX_LANGUAGES = 60

const MAX_APP_NAME_LENGTH = 80

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/** `strings-bloodsugar-20260902-1145.zip` — đọc tên là biết của app nào, lúc nào. */
function archiveFileName(appName: string, at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  const slug = slugify(appName)
  return slug.length === 0 ? `strings-${stamp}.zip` : `strings-${slug}-${stamp}.zip`
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  // Chặn theo Content-Length trước khi đọc thân: không có bước này thì một
  // yêu cầu 500 MB vẫn được nạp trọn vào bộ nhớ rồi mới bị từ chối.
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES * 2) {
    return jsonError(AppErrors.validation('Nội dung gửi lên quá lớn.'))
  }

  const body = await readJsonBody<TranslationRequest>(request)
  if (body === null) {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  const xml = typeof body.xml === 'string' ? body.xml : ''
  if (xml.trim().length === 0) {
    return jsonError(AppErrors.validation('Thiếu nội dung tệp strings.xml.'))
  }

  const appName =
    typeof body.appName === 'string' && body.appName.trim().length > 0
      ? body.appName.trim().slice(0, MAX_APP_NAME_LENGTH)
      : 'Android'

  const requested = Array.isArray(body.languages) ? body.languages : []
  if (requested.length === 0) {
    return jsonError(AppErrors.validation('Chưa chọn ngôn ngữ nào để dịch.'))
  }
  if (requested.length > MAX_LANGUAGES) {
    return jsonError(AppErrors.validation(`Mỗi lượt tối đa ${MAX_LANGUAGES} ngôn ngữ.`))
  }

  const languages: LanguageOption[] = []
  for (const code of requested) {
    const language = typeof code === 'string' ? findLanguage(code) : undefined
    if (language === undefined) {
      return jsonError(AppErrors.validation(`"${String(code)}" không nằm trong danh sách ngôn ngữ hỗ trợ.`))
    }
    // Cùng một mã gửi hai lần sẽ ghi đè lên nhau trong tệp zip; bỏ trùng ở đây.
    if (!languages.some((existing) => existing.code === language.code)) languages.push(language)
  }

  // Kiểm lại ở máy chủ dù trình duyệt đã kiểm: bên kia là màn hình, không phải
  // hàng rào. Một lượt gọi API viết tay đi thẳng vào đây.
  const report = validateStringsXml(xml)
  if (!report.acceptable) {
    const first = report.findings.find((finding) => finding.severity === 'error')
    return jsonError(
      AppErrors.validation(first?.message ?? 'Tệp strings.xml không hợp lệ.', {
        detail: report.findings
          .filter((finding) => finding.severity === 'error')
          .map((finding) => finding.message)
          .join(' · '),
      }),
    )
  }

  // Thiếu khoá API thì nói ngay, đừng để người dùng chờ hết 28 ngôn ngữ mới biết.
  const config = serverContainer.translation.config()
  if (!config.ok) return jsonError(config.error)

  const options = serverContainer.translation.options()

  // `headers()` chỉ đọc được trong phạm vi request, mà thân luồng bên dưới chạy
  // sau khi handler đã trả về. Chụp lại ở đây.
  const origin = await requestInfo()
  const startedAt = Date.now()

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: TranslationEvent): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Trình duyệt đã đóng kết nối. Không còn ai nghe, nên ngừng ghi.
          closed = true
        }
      }

      send({ type: 'started', languages: languages.map((l) => l.code), chunks: report.chunkCount })

      const translated = await translateStringsFile(
        { translator: serverContainer.translation.translator },
        {
          xml,
          appName,
          languages,
          chunkTokenLimit: options.chunkTokenLimit,
          languageConcurrency: options.languageConcurrency,
          chunkConcurrency: options.chunkConcurrency,
          preferNumericEntities: options.preferNumericEntities,
          escapeApostrophes: options.escapeApostrophes,
        },
        (code, failure) => {
          send({
            type: 'language',
            code,
            ok: failure === null,
            ...(failure !== null ? { message: failure.message } : {}),
          })
        },
        request.signal,
      )

      const record = async (succeeded: boolean, detail: string): Promise<void> => {
        await serverContainer.audit.record({
          ...origin,
          action: 'STRINGS_TRANSLATE',
          userId: user.value.id,
          targetKey: appName,
          detail,
          succeeded,
        })
      }

      if (!translated.ok) {
        await record(false, translated.error.message)
        send({
          type: 'failed',
          kind: translated.error.kind,
          message: translated.error.message,
          ...(translated.error.detail !== undefined ? { detail: translated.error.detail } : {}),
        })
        controller.close()
        return
      }

      const at = new Date()
      const zip = buildZipArchive(
        translated.value.files.map((file) => ({ path: file.path, content: file.xml })),
        at,
      )

      const seconds = Math.round((Date.now() - startedAt) / 1000)
      const failedCount = translated.value.failed.length
      await record(
        failedCount === 0,
        `${languages.length} ngôn ngữ, ${translated.value.chunkCount} mẻ, ${seconds}s` +
          (failedCount === 0 ? '' : `, hỏng ${failedCount}: ${translated.value.failed.map((f) => f.code).join(', ')}`),
      )

      send({
        type: 'finished',
        archive: {
          fileName: archiveFileName(appName, at),
          base64: zip.toString('base64'),
          byteLength: zip.byteLength,
        },
        failed: translated.value.failed,
      })
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Nói với nginx đứng trước: đừng gom bộ đệm, luồng này có giá trị vì nó
      // chảy dần. Không có dòng này thì tiến độ về thành một cục ở cuối.
      'X-Accel-Buffering': 'no',
    },
  })
}
