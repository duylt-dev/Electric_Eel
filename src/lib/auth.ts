import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

import { PrismaUserRepository } from '../data/db/PrismaUserRepository'
import type { GlobalRole } from '../domain/identity/entities/Permission'

/**
 * Đăng nhập bằng tài khoản nội bộ.
 *
 * Không dùng Prisma adapter của Auth.js: adapter đó phục vụ phiên lưu trong DB
 * và các nhà cung cấp OAuth, mà Credentials thì bắt buộc phải dùng phiên JWT.
 * Thêm adapter vào chỉ tạo ra ba bảng không ai đọc.
 *
 * Kiểm tra quyền KHÔNG nằm ở middleware. Middleware chạy trên edge runtime,
 * nơi bcrypt và Prisma đều không chạy được; nhét chúng vào đó là tự chuốc lấy
 * một tầng phải giả lập. Thay vào đó mỗi layout và mỗi Route Handler tự gọi
 * `requireUser()` — chậm hơn không đáng kể, và không có đường vòng nào bỏ sót.
 *
 * Những gì token nói về người dùng chỉ là ảnh chụp lúc đăng nhập. Nơi quyết
 * định người đó CÒN được vào hay không là `lib/session.ts`, chỗ đọc lại hàng
 * `User` ở mỗi request. Đừng đọc `token.role` để phân quyền ở bất cứ đâu khác.
 */
const users = new PrismaUserRepository()

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Tám tiếng, không phải mười hai: vừa đúng một ngày làm việc, nên máy bỏ
  // quên sau giờ làm không còn phiên mở sẵn tới sáng hôm sau. Rút ngắn ở đây
  // là lựa chọn thay cho việc bắt nhập lại mật khẩu trước mỗi lần publish.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login' },
  // Tin Host header của request. Chỉ an toàn khi URL gốc đã được ghim bằng
  // `AUTH_URL` — `lib/env.ts` bắt buộc biến đó ở production đúng vì lý do này.
  trustHost: true,
  providers: [
    Credentials({
      name: 'Tài khoản nội bộ',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mật khẩu', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === 'string' ? credentials.email : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (email.length === 0 || password.length === 0) return null

        const verified = await users.verifyPassword(email, password)
        if (!verified.ok || verified.value === null) return null

        return {
          id: verified.value.id,
          email: verified.value.email,
          name: verified.value.name,
          role: verified.value.role,
        }
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.uid = user.id
        token.role = (user as { role?: GlobalRole }).role ?? 'MEMBER'
      }
      return token
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = typeof token.uid === 'string' ? token.uid : ''
        session.user.role = token.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'
      }
      return session
    },
  },
})
