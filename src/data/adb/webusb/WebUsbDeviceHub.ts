import { Adb, AdbDaemonTransport } from '@yume-chan/adb'
import type { AdbCredentialStore } from '@yume-chan/adb'
import AdbWebCredentialStore from '@yume-chan/adb-credential-web'
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb'
import type { AdbDaemonWebUsbDeviceObserver } from '@yume-chan/adb-daemon-webusb'

import { AppErrors, type AppError, type Result, err, ok } from '../../../core/result'
import { isSafeSerial } from '../../../domain/adb/entities/AdbDevice'
import type { AdbDevice, AdbDeviceState } from '../../../domain/adb/entities/AdbDevice'
import type { DeviceWatchEvent } from '../../../domain/adb/entities/DeviceWatchEvent'
import { TangoAdbShell } from './TangoAdbShell'

/**
 * Sổ thiết bị WebUSB của cả tab: máy nào đang cắm, máy nào đã bắt tay xong,
 * và kết nối `Adb` tới từng máy.
 *
 * ─── Vì sao là MỘT sổ cho cả tab ───
 *
 * Một kết nối USB chỉ một chỗ mở được. Màn chọn máy và màn xem log là hai
 * ViewModel với hai vòng đời, nhưng chúng phải dùng CÙNG một kết nối tới cùng
 * một máy — mở kết nối thứ hai là kết nối thứ nhất bị đá ra, và màn hình vừa
 * rời đi sẽ thấy máy "mất kết nối" không vì lý do gì. Nên kết nối sống ở đây,
 * ngoài mọi ViewModel, và chỉ đóng khi máy rút hoặc tab đóng.
 *
 * ─── Bắt tay ───
 *
 * `authenticate` chỉ trả về khi máy chấp nhận khoá. Khoá RSA của trình duyệt
 * KHÁC khoá của `adb` trên máy tính, nên lần đầu điện thoại hỏi "Cho phép gỡ
 * lỗi USB?" thêm một lần; khoá được cất trong IndexedDB nên các lần sau không
 * hỏi nữa. Trong lúc chờ, máy ở trạng thái `connecting` rồi `unauthorized` —
 * hai trạng thái ấy chỉ để màn hình nói người dùng nhìn xuống điện thoại.
 */

/** Sau chừng này mà máy chưa trả lời bắt tay thì gần chắc là đang chờ người bấm "Cho phép". */
const AUTHORIZING_AFTER_MS = 1_500

interface Link {
  readonly device: AdbDaemonWebUsbDevice
  state: AdbDeviceState
  adb: Adb | null
  /** Vì sao `offline` — hiện cho người dùng qua sự kiện `failed`. */
  failure: AppError | null
}

/**
 * Quy lỗi WebUSB về câu nói được bước tiếp theo.
 *
 * `DeviceBusyError` là lỗi hay gặp nhất với dev Android: Android Studio (hay
 * `adb` gõ tay) đang giữ cổng USB, và trình duyệt không claim được. Nó không
 * tự hết — phải tắt adb server ở máy tính.
 */
export function describeUsbFailure(thrown: unknown): AppError {
  if (thrown instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
    return AppErrors.upstream(
      'Thiết bị đang bị chương trình khác giữ — thường là adb của Android Studio. Chạy `adb kill-server` trong terminal rồi rút cáp cắm lại.',
      { cause: thrown },
    )
  }
  const name = thrown instanceof DOMException ? thrown.name : ''
  if (name === 'SecurityError') {
    return AppErrors.forbidden('Trình duyệt không cho trang này dùng USB. Mở trang bằng https rồi thử lại.', {
      cause: thrown,
    })
  }
  if (name === 'NotFoundError') {
    return AppErrors.notFound('Không còn thấy thiết bị này. Cắm lại cáp rồi thử lại.', { cause: thrown })
  }
  if (name === 'NetworkError') {
    return AppErrors.upstream(
      'Không mở được thiết bị. Nếu Android Studio hay adb đang chạy, tắt chúng (`adb kill-server`) rồi rút cáp cắm lại.',
      { cause: thrown },
    )
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  return AppErrors.upstream('Không nối được với thiết bị.', { detail: message, cause: thrown })
}

export class WebUsbDeviceHub {
  readonly #manager: AdbDaemonWebUsbDeviceManager | undefined
  readonly #credentials: AdbCredentialStore
  readonly #links = new Map<string, Link>()
  readonly #listeners = new Set<() => void>()
  #observer: Promise<AdbDaemonWebUsbDeviceObserver> | null = null

  constructor(
    manager: AdbDaemonWebUsbDeviceManager | undefined = AdbDaemonWebUsbDeviceManager.BROWSER,
    credentials: AdbCredentialStore = new AdbWebCredentialStore(),
  ) {
    this.#manager = manager
    this.#credentials = credentials
  }

  /** `null` khi trình duyệt không có WebUSB, kèm câu nói phải làm gì. */
  #requireManager(): Result<AdbDaemonWebUsbDeviceManager> {
    if (this.#manager === undefined) {
      return err(
        AppErrors.upstream(
          'Trình duyệt này không có WebUSB. Mở bằng Chrome hoặc Edge (bản máy tính) để nối thiết bị.',
        ),
      )
    }
    return ok(this.#manager)
  }

  /** Ảnh chụp danh sách hiện tại, theo thứ tự máy được thấy. */
  snapshot(): AdbDevice[] {
    return [...this.#links.values()].map((link) => ({
      serial: link.device.serial,
      state: link.state,
      model: link.adb?.banner.model ?? (link.device.name.length > 0 ? link.device.name : null),
      product: link.adb?.banner.product ?? null,
    }))
  }

  #notify(): void {
    for (const listener of this.#listeners) listener()
  }

  /** Mở hộp chọn thiết bị của trình duyệt. Phải gọi từ một cú bấm. */
  async requestDevice(): Promise<Result<AdbDevice | null>> {
    const manager = this.#requireManager()
    if (!manager.ok) return manager
    try {
      const device = await manager.value.requestDevice()
      if (device === undefined) return ok(null)
      // Observer (nếu đang chạy) cũng nhận `connect` từ lời gọi trên; `#adopt`
      // là idempotent nên gọi hai lần không mở hai kết nối.
      this.#adopt(device)
      const link = this.#links.get(device.serial)
      return ok(
        link === undefined
          ? null
          : { serial: device.serial, state: link.state, model: device.name || null, product: null },
      )
    } catch (thrown) {
      return err(describeUsbFailure(thrown))
    }
  }

  /** Nhận một máy vào sổ và bắt đầu bắt tay ở nền. Gọi lại với máy đã có thì không làm gì. */
  #adopt(device: AdbDaemonWebUsbDevice): void {
    if (!isSafeSerial(device.serial)) return
    if (this.#links.has(device.serial)) return

    const link: Link = { device, state: 'connecting', adb: null, failure: null }
    this.#links.set(device.serial, link)
    this.#notify()
    void this.#connect(link)
  }

  async #connect(link: Link): Promise<void> {
    const authorizing = setTimeout(() => {
      if (link.state === 'connecting') {
        link.state = 'unauthorized'
        this.#notify()
      }
    }, AUTHORIZING_AFTER_MS)

    try {
      const connection = await link.device.connect()
      const transport = await AdbDaemonTransport.authenticate({
        serial: link.device.serial,
        connection,
        credentialStore: this.#credentials,
      })
      const adb = new Adb(transport)
      link.adb = adb
      link.state = 'device'
      link.failure = null

      // Máy rút cáp hay tắt USB debugging: kết nối chết, và sổ phải biết ngay
      // chứ không đợi lệnh kế tiếp hỏng.
      void adb.disconnected.then(() => {
        if (link.adb !== adb) return
        link.adb = null
        if (this.#links.get(link.device.serial) === link) {
          link.state = 'offline'
          this.#notify()
        }
      })
    } catch (thrown) {
      link.state = 'offline'
      link.failure = describeUsbFailure(thrown)
    } finally {
      clearTimeout(authorizing)
      this.#notify()
    }
  }

  #drop(device: AdbDaemonWebUsbDevice): void {
    const link = this.#links.get(device.serial)
    // So bằng `raw` (USBDevice thật): observer và `requestDevice` mỗi bên bọc
    // cùng một USBDevice bằng một instance riêng.
    if (link === undefined || link.device.raw !== device.raw) return
    this.#links.delete(device.serial)
    const adb = link.adb
    link.adb = null
    if (adb !== null) void adb.close().catch(() => undefined)
    this.#notify()
  }

  async #observe(): Promise<Result<AdbDaemonWebUsbDeviceObserver>> {
    const manager = this.#requireManager()
    if (!manager.ok) return manager
    if (this.#observer === null) {
      this.#observer = manager.value.trackDevices().then((observer) => {
        observer.onDeviceAdd((devices) => devices.forEach((device) => this.#adopt(device)))
        observer.onDeviceRemove((devices) => devices.forEach((device) => this.#drop(device)))
        observer.current.forEach((device) => this.#adopt(device))
        return observer
      })
      this.#observer.catch(() => {
        this.#observer = null
      })
    }
    try {
      return ok(await this.#observer)
    } catch (thrown) {
      return err(describeUsbFailure(thrown))
    }
  }

  /**
   * Theo dõi danh sách máy cho tới khi `signal` huỷ. Đẩy thật từ sự kiện USB,
   * không hỏi theo nhịp. Máy bắt tay hỏng thì báo `failed` MỘT lần kèm lý do —
   * luồng không dừng, và danh sách vẫn đúng.
   */
  async watch(emit: (event: DeviceWatchEvent) => void, signal: AbortSignal): Promise<Result<void>> {
    const observer = await this.#observe()
    if (!observer.ok) return observer
    if (signal.aborted) return ok(undefined)

    // Mở lại luồng (nút "Thử lại") là lúc bắt tay lại những máy hỏng lần
    // trước: người dùng vừa `adb kill-server` xong thì USB không phát sự kiện
    // nào, nên không có gì khác kích hoạt lần thử thứ hai.
    for (const link of this.#links.values()) {
      if (link.state === 'offline' && link.adb === null) {
        link.state = 'connecting'
        link.failure = null
        void this.#connect(link)
      }
    }

    const reported = new Set<AppError>()
    const push = (): void => {
      if (signal.aborted) return
      emit({ type: 'devices', devices: this.snapshot() })
      for (const link of this.#links.values()) {
        if (link.failure !== null && !reported.has(link.failure)) {
          reported.add(link.failure)
          emit({ type: 'failed', message: link.failure.message })
        }
      }
    }

    push()
    this.#listeners.add(push)
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    this.#listeners.delete(push)
    return ok(undefined)
  }

  /**
   * Shell của một máy, chờ bắt tay xong nếu cần.
   *
   * Tải lại trang là sổ này trống — quyền USB thì trình duyệt nhớ, còn kết
   * nối thì không. Nên trước khi trả lời "không thấy máy", phải mở observer
   * (nó nhận lại mọi máy đã cho phép) rồi đợi máy bắt tay xong. Đợi có trần:
   * lâu hơn thế là người dùng chưa bấm "Cho phép" trên điện thoại, và câu
   * trả lời đúng lúc đó là lỗi `forbidden` nói đúng việc ấy.
   */
  async shellReady(serial: string, signal?: AbortSignal, timeoutMs = 20_000): Promise<Result<TangoAdbShell>> {
    const observer = await this.#observe()
    if (!observer.ok) return observer

    const settled = (): boolean => {
      const link = this.#links.get(serial)
      return link === undefined || link.state === 'device' || link.state === 'offline'
    }

    if (!settled()) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, timeoutMs)
        const listener = (): void => {
          if (settled()) done()
        }
        function done(): void {
          clearTimeout(timer)
          signal?.removeEventListener('abort', done)
          cleanup()
          resolve()
        }
        const cleanup = (): void => {
          this.#listeners.delete(listener)
        }
        this.#listeners.add(listener)
        signal?.addEventListener('abort', done, { once: true })
      })
    }
    if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ.'))
    return this.shellFor(serial)
  }

  /** Shell của một máy ĐÃ bắt tay xong. Máy chưa xong thì nói rõ đang ở bước nào. */
  shellFor(serial: string): Result<TangoAdbShell> {
    const link = this.#links.get(serial)
    if (link === undefined) {
      return err(AppErrors.notFound('Không còn thấy thiết bị này. Chọn lại máy ở danh sách.'))
    }
    if (link.adb !== null && link.state === 'device') return ok(new TangoAdbShell(link.adb))
    switch (link.state) {
      case 'connecting':
      case 'unauthorized':
        return err(
          AppErrors.forbidden(
            'Thiết bị chưa cho phép gỡ lỗi. Mở khoá màn hình rồi bấm "Cho phép" ở hộp thoại USB debugging.',
          ),
        )
      default:
        return err(link.failure ?? AppErrors.upstream('Thiết bị đang mất kết nối. Rút cáp cắm lại.'))
    }
  }
}
