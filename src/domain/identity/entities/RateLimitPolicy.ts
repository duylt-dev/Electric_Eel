/**
 * Hạn mức cho những thao tác đoán được bằng cách thử nhiều lần.
 *
 * Bcrypt cost 12 tốn khoảng một phần tư giây CPU mỗi lần so sánh. Con số đó
 * làm chậm người dò mật khẩu, nhưng cũng có nghĩa là vài trăm request đồng
 * thời đủ ghim CPU của server — nên hạn mức ở đây vừa chống dò mật khẩu vừa
 * chống làm nghẽn dịch vụ, và phải chặn TRƯỚC khi gọi bcrypt.
 */
export interface RateLimitRule {
  /** Bao nhiêu lần hỏng thì khoá. */
  readonly limit: number
  /** Khoảng thời gian đếm, tính bằng giây. */
  readonly windowSeconds: number
}

/**
 * Hai hạn mức chạy song song, phải qua cả hai.
 *
 * Chỉ đếm theo email thì người dò chỉ cần đổi email sau mỗi năm lần. Chỉ đếm
 * theo IP thì cả một văn phòng dùng chung NAT sẽ khoá lẫn nhau. Hạn mức theo
 * IP vì vậy đặt rộng hơn nhiều: nó nhắm vào máy đang quét, không nhắm vào
 * người quên mật khẩu.
 */
export const LOGIN_RULE_BY_EMAIL: RateLimitRule = { limit: 5, windowSeconds: 15 * 60 }
export const LOGIN_RULE_BY_IP: RateLimitRule = { limit: 30, windowSeconds: 15 * 60 }

/** Dọn bản ghi cũ hơn mốc này; không cần giữ lâu hơn cửa sổ dài nhất. */
export const RATE_LIMIT_RETENTION_SECONDS = 24 * 60 * 60

export const loginEmailBucket = (email: string): string => `login:email:${email.trim().toLowerCase()}`
export const loginIpBucket = (ip: string): string => `login:ip:${ip}`

export interface RateLimitVerdict {
  readonly allowed: boolean
  /** Còn bao nhiêu giây nữa mới thử lại được. 0 khi đang được phép. */
  readonly retryAfterSeconds: number
}

/**
 * Quy số lần đã hỏng thành phán quyết.
 *
 * `oldestHitAt` là thời điểm lần hỏng cũ nhất còn nằm trong cửa sổ — khi nó
 * trôi ra khỏi cửa sổ thì người dùng có lại một lượt. Nói được "thử lại sau
 * bao lâu" quan trọng hơn nói "bị khoá": câu thứ hai khiến người quên mật khẩu
 * tưởng tài khoản mình hỏng.
 */
export function judge(
  rule: RateLimitRule,
  hitCount: number,
  oldestHitAt: Date | null,
  now: Date = new Date(),
): RateLimitVerdict {
  if (hitCount < rule.limit || oldestHitAt === null) {
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const elapsedSeconds = Math.floor((now.getTime() - oldestHitAt.getTime()) / 1000)
  const remaining = rule.windowSeconds - elapsedSeconds

  if (remaining <= 0) return { allowed: true, retryAfterSeconds: 0 }
  return { allowed: false, retryAfterSeconds: remaining }
}

/** Câu thông báo cho người dùng — nói khi nào thử lại được, không nói vì sao bị chặn. */
export function describeRetryAfter(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1
    ? 'Thử lại sau khoảng một phút.'
    : `Thử lại sau khoảng ${minutes} phút.`
}
