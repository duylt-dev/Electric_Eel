import { AppErrors, type Result, err, ok } from '../../core/result'
import type { AdbDevice } from '../../domain/adb/entities/AdbDevice'
import type { LogcatEvent, LogcatRequest } from '../../domain/adb/entities/LogcatSession'
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
  async listDevices(signal?: AbortSignal): Promise<Result<AdbDevice[]>> {
    const body = await request<{ devices: AdbDevice[] }>('/devices', { method: 'GET' }, signal)
    return body.ok ? ok(body.value.devices) : body
  }

  async connect(address: string, signal?: AbortSignal): Promise<Result<AdbDevice[]>> {
    const body = await request<{ devices: AdbDevice[] }>(
      '/devices',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', address }),
      },
      signal,
    )
    return body.ok ? ok(body.value.devices) : body
  }

  async disconnect(address: string, signal?: AbortSignal): Promise<Result<AdbDevice[]>> {
    const body = await request<{ devices: AdbDevice[] }>(
      '/devices',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', address }),
      },
      signal,
    )
    return body.ok ? ok(body.value.devices) : body
  }

  async listPackages(
    serial: string,
    includeSystem: boolean,
    signal?: AbortSignal,
  ): Promise<Result<string[]>> {
    const query = new URLSearchParams({ serial, ...(includeSystem ? { system: '1' } : {}) })
    const body = await request<{ packages: string[] }>(
      `/packages?${query.toString()}`,
      { method: 'GET' },
      signal,
    )
    return body.ok ? ok(body.value.packages) : body
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
