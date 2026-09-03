import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { DEFAULT_LOGCAT_FILTER, toggleLevel } from '@/domain/adb/entities/LogcatFilter'
import { formatLogcatLine, parseLogcatLine } from '@/domain/adb/entities/LogcatLine'
import type { LogcatLine } from '@/domain/adb/entities/LogcatLine'
import type { AdbRepository } from '@/domain/adb/repositories/AdbRepository'
import { appendLines, initialAdbLogcatState, logFileName, visibleLines } from './AdbLogcatContract'
import type { AdbLogcatEffect, AdbLogcatIntent, AdbLogcatState } from './AdbLogcatContract'

/**
 * ViewModel của màn xem log.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Việc tải tệp về là Effect, không phải lời gọi thẳng vào `document`.
 *
 * ─── Vì sao tách dòng ở đây chứ không ở máy chủ ───
 *
 * Máy chủ đẩy về dòng thô, đúng như adb in ra. Tách thành pid/tag/mức là việc
 * của bên vẽ, và làm ở đây thì nó xảy ra một lần cho mỗi dòng, ngay trước khi
 * dòng đó vào đệm — chứ không phải mỗi lần bộ lọc đổi.
 */
export interface AdbLogcatDeps {
  adb: AdbRepository
  serial: string
  packageName: string
}

type Context = IntentContext<AdbLogcatState, AdbLogcatEffect>

/** Khoá gộp của luồng log. Mở luồng mới hoặc bấm dừng đều huỷ luồng đang chạy. */
const STREAM_KEY = 'stream'

/**
 * Số thứ tự cấp cho từng dòng.
 *
 * Đây là khoá React của mỗi dòng, nên nó phải là duy nhất trong suốt vòng đời
 * màn hình — không thể dùng chỉ số trong mảng, vì đệm bị cắt từ đầu và mọi chỉ
 * số sẽ trượt đi một lượt sau mỗi lần cắt.
 */
let nextSeq = 0

function ingest(ctx: Context, raw: readonly string[]): void {
  const parsed: LogcatLine[] = []
  for (const line of raw) {
    const entry = parseLogcatLine(line, nextSeq)
    if (entry === null) continue
    nextSeq += 1
    parsed.push(entry)
  }
  if (parsed.length === 0) return

  ctx.setState((state) => {
    // Đang tạm dừng: dồn sang chỗ chờ, màn hình đứng yên. Không vứt đi.
    if (state.paused) return { ...state, holding: [...state.holding, ...parsed] }

    const merged = appendLines(state.lines, parsed, state.dropped)
    return { ...state, lines: merged.lines, dropped: merged.dropped }
  })
}

async function stream(ctx: Context, deps: AdbLogcatDeps, clearFirst: boolean): Promise<void> {
  ctx.setState((state) => ({ ...state, status: 'connecting', error: null }))

  const outcome = await deps.adb.streamLogcat(
    { serial: deps.serial, packageName: deps.packageName, clearFirst },
    (event) => {
      // Luồng đã bị thay bằng luồng mới: đừng vẽ tiếp lên màn hình của lượt sau.
      if (ctx.signal.aborted) return

      switch (event.type) {
        case 'attached':
          ctx.setState((state) => ({
            ...state,
            status: 'streaming',
            pid: event.pid,
            // Lần bám đầu chưa tính là khởi động lại; từ lần thứ hai trở đi thì có.
            restarts: state.pid === null ? state.restarts : state.restarts + 1,
          }))
          return

        case 'waiting':
          ctx.setState((state) => ({ ...state, status: 'waiting', pid: null }))
          return

        case 'lines':
          ingest(ctx, event.lines)
          return

        case 'detached':
          ctx.setState((state) => ({ ...state, status: 'waiting', pid: null }))
          return

        case 'notice':
          ctx.emit({ type: 'ShowMessage', severity: 'info', message: event.message })
          return

        case 'failed':
          // Lỗi đã được adapter quy thành `Err`; ở đây không phải làm gì thêm.
          return
      }
    },
    ctx.signal,
  )

  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    if (outcome.error.kind === 'cancelled') return
    ctx.setState((state) => ({ ...state, status: 'failed', pid: null, error: outcome.error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    return
  }

  // Luồng chỉ kết thúc bình thường khi máy chủ đóng nó — thường là do server
  // khởi động lại. Nói ra, đừng để màn hình đứng im mà không ai biết vì sao.
  ctx.setState((state) => ({ ...state, status: 'stopped', pid: null }))
}

export const AdbLogcatViewModel = defineViewModel<
  AdbLogcatState,
  AdbLogcatIntent,
  AdbLogcatEffect,
  AdbLogcatDeps
>({
  name: 'AdbLogcat',

  initialState: (deps) => initialAdbLogcatState(deps.serial, deps.packageName),

  // Mở luồng ngay khi màn hình dựng lên. Người ta vào đây để xem log, không
  // phải để bấm một nút bắt đầu.
  onStart: (ctx, deps) => stream(ctx, deps, false),

  intentKey: (intent) =>
    intent.type === 'StreamRequested' ||
    intent.type === 'StreamStopped' ||
    intent.type === 'DeviceBufferCleared'
      ? STREAM_KEY
      : undefined,

  async handleIntent(intent, ctx, deps) {
    switch (intent.type) {
      case 'StreamRequested':
        await stream(ctx, deps, intent.clearFirst)
        return

      case 'StreamStopped':
        // Luồng đang chạy đã bị chính khoá intent huỷ trước khi tới đây; ở đây
        // chỉ còn việc đưa màn hình về trạng thái bấm chạy lại được.
        ctx.setState((state) => ({ ...state, status: 'stopped', pid: null }))
        ctx.emit({ type: 'ShowMessage', severity: 'info', message: 'Đã dừng đọc log.' })
        return

      case 'PauseToggled':
        ctx.setState((state) => {
          if (!state.paused) return { ...state, paused: true, holding: [] }

          const merged = appendLines(state.lines, state.holding, state.dropped)
          return {
            ...state,
            paused: false,
            holding: [],
            lines: merged.lines,
            dropped: merged.dropped,
          }
        })
        return

      case 'ScreenCleared':
        ctx.setState((state) => ({ ...state, lines: [], holding: [], dropped: 0 }))
        return

      case 'DeviceBufferCleared':
        // Xoá đệm trên máy rồi mở lại luồng: `clearFirst` làm cả hai việc trong
        // đúng thứ tự, nên không có khoảng nào luồng cũ còn chảy vào đệm mới.
        ctx.setState((state) => ({ ...state, lines: [], holding: [], dropped: 0 }))
        await stream(ctx, deps, true)
        return

      case 'LevelToggled':
        ctx.setState((state) => ({ ...state, filter: toggleLevel(state.filter, intent.level) }))
        return

      case 'TagFilterChanged':
        ctx.setState((state) => ({ ...state, filter: { ...state.filter, tag: intent.value } }))
        return

      case 'QueryChanged':
        ctx.setState((state) => ({ ...state, filter: { ...state.filter, query: intent.value } }))
        return

      case 'FilterCleared':
        ctx.setState((state) => ({ ...state, filter: DEFAULT_LOGCAT_FILTER }))
        return

      case 'AutoScrollChanged':
        ctx.setState((state) => ({ ...state, autoScroll: intent.value }))
        return

      case 'DownloadRequested': {
        const state = ctx.getState()
        // Tải về ĐÚNG thứ đang thấy, không phải toàn bộ đệm: người ta bấm tải
        // sau khi đã lọc ra được vài chục dòng đáng gửi cho đồng nghiệp, và
        // một tệp năm nghìn dòng thì lọc lại từ đầu.
        const shown = visibleLines(state)
        if (shown.length === 0) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chưa có dòng nào để tải.' })
          return
        }

        const header = [
          `# ${state.packageName} · thiết bị ${state.serial}`,
          `# ${shown.length} dòng, xuất lúc ${new Date().toLocaleString('vi-VN')}`,
          '',
        ].join('\n')

        ctx.emit({
          type: 'DownloadLog',
          fileName: logFileName(state.packageName, new Date()),
          content: header + shown.map(formatLogcatLine).join('\n') + '\n',
        })
        return
      }
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  createDependencies: () => {
    throw new Error(
      'AdbLogcatViewModel cần được cấp phụ thuộc: <AdbLogcatViewModel.Provider deps={{ adb, serial, packageName }}>. ' +
        'serial và packageName chỉ biết được ở thời điểm dựng màn hình nên không thể lấy mặc định ở đây.',
    )
  },
})

/** Phụ thuộc dùng thật trong ứng dụng. Test truyền bộ khác vào. */
export const adbLogcatDeps = (serial: string, packageName: string): AdbLogcatDeps => ({
  adb: clientContainer.adb,
  serial,
  packageName,
})
