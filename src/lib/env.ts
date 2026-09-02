import 'server-only'

import { type EnvProblem, inspectServerEnv } from './envRules'

/**
 * Chốt chặn cấu hình lúc khởi động.
 *
 * Luật nằm ở `envRules.ts` (hàm thuần, test được). Ở đây chỉ còn việc đọc
 * `process.env` thật và quyết định ném hay cảnh báo — và `server-only` khiến
 * build gãy nếu file này lỡ bị kéo vào bundle của trình duyệt.
 */
const describe = (problem: EnvProblem): string => `  · ${problem.variable}: ${problem.message}`

/**
 * Gọi lúc khởi động. Ở production thì ném; ở dev thì cảnh báo rồi chạy tiếp,
 * vì một máy dev vừa clone repo về chưa có `.env` mà vẫn cần chạy được.
 *
 * Ném ở đây không giết tiến trình — Next bắt lỗi của móc khởi động rồi trả 500
 * cho mọi request và thử nạp lại móc ở request sau. Kết quả vẫn đúng ý muốn
 * (không có gì được phục vụ khi cấu hình sai), chỉ khác là nhật ký sẽ lặp lại
 * cùng một thông báo cho tới khi cấu hình được sửa.
 */
export function assertServerEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = inspectServerEnv(env)
  if (problems.length === 0) return

  const fatal = problems.filter((problem) => problem.severity === 'fatal')
  const warnings = problems.filter((problem) => problem.severity === 'warning')

  if (warnings.length > 0) {
    console.warn(
      `[env] ${warnings.length} cảnh báo cấu hình:\n${warnings.map(describe).join('\n')}`,
    )
  }

  if (fatal.length > 0) {
    throw new Error(
      `Cấu hình môi trường không hợp lệ, không phục vụ request nào:\n${fatal.map(describe).join('\n')}\n\n` +
        'Xem `.env.example` để biết từng biến dùng làm gì.',
    )
  }
}
