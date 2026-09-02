'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

import { serverContainer } from '@/di/server'
import {
  LOGIN_RULE_BY_EMAIL,
  LOGIN_RULE_BY_IP,
  describeRetryAfter,
  loginEmailBucket,
  loginIpBucket,
} from '@/domain/identity/entities/RateLimitPolicy'
import { signIn } from '@/lib/auth'
import { requestInfo } from '@/lib/requestInfo'
import type { LoginFormState } from './formState'

/**
 * Đăng nhập.
 *
 * Chỉ trả về đúng một câu cho mọi kiểu thất bại — sai email, sai mật khẩu, hay
 * tài khoản đã khoá. Phân biệt chúng giúp người dùng thật rất ít, nhưng giúp
 * người dò tài khoản rất nhiều.
 *
 * Hạn mức được kiểm TRƯỚC khi gọi `signIn`, và đó là điểm mấu chốt: `signIn`
 * dẫn tới một phép so sánh bcrypt cost 12, tốn khoảng một phần tư giây CPU.
 * Kiểm sau khi so sánh thì vẫn chặn được người dò mật khẩu nhưng không chặn
 * được việc vài trăm request đồng thời ghim hết CPU của máy chủ.
 */
export async function loginAction(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (email.length === 0 || password.length === 0) {
    return { message: 'Nhập cả email và mật khẩu.' }
  }

  const { ipAddress, userAgent } = await requestInfo()
  const emailBucket = loginEmailBucket(email)
  const ipBucket = ipAddress === null ? null : loginIpBucket(ipAddress)

  const { rateLimit, audit } = serverContainer

  const [byEmail, byIp] = await Promise.all([
    rateLimit.check(emailBucket, LOGIN_RULE_BY_EMAIL),
    ipBucket === null ? null : rateLimit.check(ipBucket, LOGIN_RULE_BY_IP),
  ])

  // Đếm hỏng thì cho đi tiếp, không chặn. Bộ đếm nằm cùng cơ sở dữ liệu với
  // bảng người dùng, nên khi nó hỏng thì đăng nhập cũng không thành công được;
  // chặn thêm ở đây chỉ đổi một thông báo khó hiểu lấy một thông báo khó hiểu khác.
  const blocked = [byEmail, byIp].find(
    (verdict) => verdict !== null && verdict.ok && !verdict.value.allowed,
  )

  if (blocked?.ok === true) {
    await audit.record({
      action: 'LOGIN_THROTTLED',
      targetKey: email,
      detail: `còn ${blocked.value.retryAfterSeconds}s`,
      ipAddress,
      userAgent,
      succeeded: false,
    })
    return {
      message: `Đã thử sai quá nhiều lần. ${describeRetryAfter(blocked.value.retryAfterSeconds)}`,
    }
  }

  try {
    // `redirect: false` để `signIn` TRẢ VỀ thay vì ném lỗi chuyển hướng. Nhờ
    // vậy còn chỗ để dọn bộ đếm và ghi nhật ký trước khi rời trang; với bản
    // ném lỗi thì hai việc đó không bao giờ chạy.
    await signIn('credentials', { email, password, redirect: false })
  } catch (thrown) {
    if (thrown instanceof AuthError) {
      await Promise.all([
        rateLimit.recordFailure(emailBucket),
        ipBucket === null ? Promise.resolve() : rateLimit.recordFailure(ipBucket),
        audit.record({
          action: 'LOGIN_FAILED',
          targetKey: email,
          detail: thrown.type,
          ipAddress,
          userAgent,
          succeeded: false,
        }),
      ])
      return { message: 'Email hoặc mật khẩu không đúng.' }
    }
    throw thrown
  }

  const account = await serverContainer.users.findByEmail(email)

  await Promise.all([
    rateLimit.clear(emailBucket),
    ipBucket === null ? Promise.resolve() : rateLimit.clear(ipBucket),
    audit.record({
      action: 'LOGIN_SUCCEEDED',
      userId: account.ok ? (account.value?.id ?? null) : null,
      targetKey: email,
      ipAddress,
      userAgent,
    }),
  ])

  // Ngoài `try`: `redirect` báo hiệu bằng cách ném, và nếu ném bên trong khối
  // trên thì một lần đăng nhập ĐÚNG sẽ hiện ra thành đăng nhập sai.
  redirect('/remote-config')
}
