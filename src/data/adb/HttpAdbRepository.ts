import { AppErrors, type Result, err, ok } from '../../core/result'
import type { AdbDevice } from '../../domain/adb/entities/AdbDevice'
import type { DeviceWatchEvent } from '../../domain/adb/entities/DeviceWatchEvent'
import type { LogcatEvent, LogcatRequest } from '../../domain/adb/entities/LogcatSession'
import type { PackageLabelEvent } from '../../domain/adb/entities/PackageLabelEvent'
import type { AdbRepository } from '../../domain/adb/repositories/AdbRepository'
import { toAppErrorFromResponse } from '../http/httpJson'
import { readNdjson } from '../http/ndjson'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của cổng adb: gọi Route Handler của chính
 * ứng dụng, không bao giờ chạm tới `adb`.
 *
 * Ranh giới này là điều làm cho công cụ chạy được từ một cái tab: adb sống ở
 * máy chủ cùng với thiết bị đang cắm, còn trình duyệt chỉ nhận về dữ liệu đã
 * đọc xong. Đổi lại, mọi thứ ở đây đều là một vòng mạng — nên danh sách app
 * được lấy MỘT lần rồi lọc tại chỗ, và luồng log là một kết nối giữ mở chứ
 * không phải hỏi lại theo nhịp.
 */
const BASE = '/api/adb'

const asJson = async <T>(response: Response): Promise<Result<T>> => {
  if (!response.ok) return err(await toAppErrorFromResponse(response))
  try {
    return ok((await response.json()) as T)
  } catch (thrown) {
    return err(AppErrors.unknown('Máy chủ trả về nội dung không đọc được.', { cause: thrown }))
  }
}

const request = async <T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Result<T>> => {
  try {
    const response = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      ...init,
      ...(signal !== undefined ? { signal } : {}),
    })
    return await asJson<T>(response)
  } catch (thrown) {
    if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ.'))
    return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
  }
}

export class HttpAdbRepository implements AdbRepository {
  readonly access = 'server' as const

  /** adb ở máy chủ tự thấy máy — không có hộp thoại nào để mở. */
  async requestDevice(): Promise<Result<AdbDevice | null>> {
    return err(AppErrors.validation('Máy chủ tự nhìn thấy thiết bị cắm vào nó; không cần xin quyền.'))
  }

  async listDevices(signal?: AbortSignal): Promise<Result<AdbDevice[]>> {
    const body = await request<{ devices: AdbDevice[] }>('/devices', { method: 'GET' }, signal)
    return body.ok ? ok(body.value.devices) : body
  }

  async watchDevices(
    onEvent: (event: DeviceWatchEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    let response: Response
    try {
      response = await fetch(`${BASE}/devices/stream`, {
        method: 'GET',
        headers: { Accept: 'application/x-ndjson' },
        cache: 'no-store',
        signal,
      })
    } catch (thrown) {
      if (signal.aborted) return err(AppErrors.cancelled('Đã dừng theo dõi thiết bị.'))
      return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
    }
    if (!response.ok) return err(await toAppErrorFromResponse(response))
    return readNdjson<DeviceWatchEvent>(response, onEvent, signal)
  }

  async listPackages(serial: string, signal?: AbortSignal): Promise<Result<string[]>> {
    const query = new URLSearchParams({ serial })
    const body = await request<{ packages: string[] }>(
      `/packages?${query.toString()}`,
      { method: 'GET' },
      signal,
    )
    return body.ok ? ok(body.value.packages) : body
  }

  async streamPackageLabels(
    serial: string,
    onEvent: (event: PackageLabelEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    const query = new URLSearchParams({ serial })
    let response: Response
    try {
      response = await fetch(`${BASE}/packages/labels?${query.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/x-ndjson' },
        cache: 'no-store',
        signal,
      })
    } catch (thrown) {
      if (signal.aborted) return err(AppErrors.cancelled('Đã dừng đọc nhãn.'))
      return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
    }
    if (!response.ok) return err(await toAppErrorFromResponse(response))
    return readNdjson<PackageLabelEvent>(response, onEvent, signal)
  }

  async clearBuffer(serial: string, signal?: AbortSignal): Promise<Result<void>> {
    const query = new URLSearchParams({ serial })
    const body = await request<{ cleared: boolean }>(
      `/logcat?${query.toString()}`,
      { method: 'DELETE' },
      signal,
    )
    return body.ok ? ok(undefined) : body
  }

  async streamLogcat(
    logcat: LogcatRequest,
    onEvent: (event: LogcatEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    let response: Response
    try {
      response = await fetch(`${BASE}/logcat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify(logcat),
        cache: 'no-store',
        signal,
      })
    } catch (thrown) {
      if (signal.aborted) return err(AppErrors.cancelled('Đã dừng luồng log.'))
      return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
    }

    // Lỗi phát hiện được TRƯỚC khi luồng bắt đầu (chưa đăng nhập, thiết bị
    // không hợp lệ, adb đang tắt) vẫn về theo đường JSON thường.
    if (!response.ok) return err(await toAppErrorFromResponse(response))

    let failure: LogcatEvent | null = null

    const read = await readNdjson<LogcatEvent>(
      response,
      (event) => {
        if (event.type === 'failed') failure = event
        onEvent(event)
      },
      signal,
    )

    if (failure !== null) {
      const event = failure as Extract<LogcatEvent, { type: 'failed' }>
      return err({
        kind: event.kind,
        message: event.message,
        ...(event.detail !== undefined ? { detail: event.detail } : {}),
      })
    }
    return read
  }
}
