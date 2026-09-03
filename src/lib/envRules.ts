/**
 * Luật kiểm tra biến môi trường của server.
 *
 * Vì sao cần: cả ba biến bí mật dưới đây đều hỏng theo kiểu IM LẶNG.
 *
 *   · Thiếu `AUTH_SECRET` thì Auth.js vẫn chạy ở dev bằng một khoá tạm. Lên
 *     production mà thiếu thì mọi phiên bị vô hiệu sau mỗi lần khởi động lại,
 *     và không có dòng log nào nói vì sao.
 *   · Thiếu `CREDENTIAL_ENCRYPTION_KEY` thì trang web chạy bình thường cho tới
 *     đúng lúc một quản trị viên gắn service account — có khi là vài tuần sau.
 *   · Đổi nhầm khoá đó thì mọi credential đã lưu không giải mã lại được, và
 *     điều đó chỉ lộ ra vào lần publish tiếp theo.
 *
 * Ba lỗi ấy đều rẻ khi phát hiện lúc khởi động và đắt khi phát hiện lúc chạy,
 * nên chúng được kiểm ở `src/instrumentation.ts` ngay khi tiến trình lên.
 *
 * File này KHÔNG có `import 'server-only'`, khác với `env.ts` bên cạnh. Các
 * hàm ở đây là hàm thuần — nhận một đối tượng môi trường, trả về danh sách vấn
 * đề — nên chúng chạy được dưới `node:test` mà không cần bundler của Next.
 * Phần thật sự đọc `process.env` nằm ở `env.ts`, và chỗ đó mới cần chốt chặn.
 */
export interface EnvProblem {
  readonly variable: string
  readonly message: string
  /** `fatal` chặn khởi động ở production; `warning` chỉ ghi log. */
  readonly severity: 'fatal' | 'warning'
}

const HEX_64 = /^[0-9a-fA-F]{64}$/

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value.trim().length === 0

/**
 * Trình duyệt coi localhost là ngữ cảnh an toàn dù đi qua http, nên cookie vẫn
 * được đánh dấu Secure. Bắt https ở đây sẽ chặn `pnpm build && pnpm start` —
 * cách chạy thử bản production tại máy — mà không đổi được gì về mức an toàn.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const isLocalUrl = (raw: string): boolean => {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname)
  } catch {
    return false
  }
}

/**
 * Liệt kê mọi vấn đề, không dừng ở cái đầu tiên.
 *
 * Dừng ở cái đầu tiên biến việc sửa cấu hình thành một chuỗi khởi động lại,
 * mỗi lần lộ thêm đúng một dòng.
 */
export function inspectServerEnv(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = []
  const isProduction = env.NODE_ENV === 'production'

  const secret = env.AUTH_SECRET
  if (isBlank(secret)) {
    problems.push({
      variable: 'AUTH_SECRET',
      message: 'Chưa đặt. Sinh bằng: openssl rand -base64 32',
      severity: isProduction ? 'fatal' : 'warning',
    })
  } else if ((secret as string).trim().length < 32) {
    problems.push({
      variable: 'AUTH_SECRET',
      message: 'Quá ngắn — cần ít nhất 32 ký tự. Sinh bằng: openssl rand -base64 32',
      severity: isProduction ? 'fatal' : 'warning',
    })
  }

  const key = env.CREDENTIAL_ENCRYPTION_KEY
  if (isBlank(key)) {
    problems.push({
      variable: 'CREDENTIAL_ENCRYPTION_KEY',
      message: 'Chưa đặt, nên không lưu và không đọc được service account nào. Sinh bằng: openssl rand -hex 32',
      severity: isProduction ? 'fatal' : 'warning',
    })
  } else if (!HEX_64.test((key as string).trim())) {
    problems.push({
      variable: 'CREDENTIAL_ENCRYPTION_KEY',
      message: 'Phải là đúng 64 ký tự hex. Sinh bằng: openssl rand -hex 32',
      severity: 'fatal',
    })
  }

  const previous = env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS
  if (!isBlank(previous) && !HEX_64.test((previous as string).trim())) {
    problems.push({
      variable: 'CREDENTIAL_ENCRYPTION_KEY_PREVIOUS',
      message: 'Phải là đúng 64 ký tự hex, hoặc bỏ hẳn biến này đi nếu không đang xoay khoá.',
      severity: 'fatal',
    })
  }
  if (!isBlank(previous) && previous?.trim() === key?.trim()) {
    problems.push({
      variable: 'CREDENTIAL_ENCRYPTION_KEY_PREVIOUS',
      message: 'Đang bằng đúng khoá hiện hành, nên không có tác dụng gì. Bỏ đi cho khỏi hiểu nhầm là đang xoay khoá.',
      severity: 'warning',
    })
  }

  if (isBlank(env.DATABASE_URL)) {
    problems.push({
      variable: 'DATABASE_URL',
      message: 'Chưa đặt.',
      severity: isProduction ? 'fatal' : 'warning',
    })
  }

  // `trustHost: true` trong `lib/auth.ts` cho phép Auth.js tin Host header của
  // request. Điều đó chỉ an toàn khi URL gốc được ghim sẵn, nếu không thì một
  // Host giả mạo có thể lái được đường dẫn quay lại sau khi đăng nhập.
  const authUrl = env.AUTH_URL
  if (isBlank(authUrl)) {
    problems.push({
      variable: 'AUTH_URL',
      message: 'Chưa đặt. Cần ghim URL gốc vì Auth.js đang được cấu hình tin Host header.',
      severity: isProduction ? 'fatal' : 'warning',
    })
  } else {
    const trimmed = (authUrl as string).trim()
    if (isProduction && !trimmed.startsWith('https://') && !isLocalUrl(trimmed)) {
      problems.push({
        variable: 'AUTH_URL',
        message:
          'Ở production phải là https — cookie phiên chỉ được đánh dấu Secure khi URL gốc là https.',
        severity: 'fatal',
      })
    }
  }

  return problems
}
