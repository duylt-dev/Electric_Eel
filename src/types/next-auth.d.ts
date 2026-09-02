import type { GlobalRole } from '@/domain/identity/entities/Permission'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: GlobalRole
    }
  }

  interface User {
    role?: GlobalRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    role?: GlobalRole
  }
}

export {}
