import { AppErrors, type Result, attemptAsync, err, ok } from '../../core/result'
import type { FirebaseAppSummary } from '../../domain/identity/entities/FirebaseAppSummary'
import type { AppAccess, AppRole, AuthenticatedUser } from '../../domain/identity/entities/Permission'
import type {
  AppDirectoryAdmin,
  AppDirectoryReader,
  CreateAppInput,
} from '../../domain/identity/repositories/AppDirectoryRepository'
import { forgetCachedCredential } from '../remote-config/FirebaseRemoteConfigRepository'
import type { AppCredentialProvider, ServiceAccount } from '../remote-config/ServiceAccount'
import { parseServiceAccount } from '../remote-config/ServiceAccount'
import { decryptCredential, encryptCredential } from '../remote-config/ServiceAccountCipher'
import { prisma } from './prismaClient'

interface AppRow {
  id: string
  slug: string
  displayName: string
  projectId: string
  packageName: string | null
  credentialCiphertext: string | null
  credentialClientEmail: string | null
  isActive: boolean
}

const toSummary = (row: AppRow, role: AppRole | null): FirebaseAppSummary => ({
  id: row.id,
  slug: row.slug,
  displayName: row.displayName,
  projectId: row.projectId,
  packageName: row.packageName,
  hasCredential: row.credentialCiphertext !== null,
  credentialClientEmail: row.credentialClientEmail,
  isActive: row.isActive,
  role,
})

const asAppRole = (value: string): AppRole =>
  value === 'EDITOR' || value === 'PUBLISHER' ? value : 'VIEWER'

/**
 * Danh bạ app trên Prisma.
 *
 * Cùng một lớp hiện thực ba cổng: đọc danh bạ, quản trị danh bạ, và cấp
 * credential cho adapter Firebase. Gộp lại vì cả ba đọc chung một bảng và
 * chung một quy tắc giải mã — tách ra chỉ để đẹp sơ đồ thì lại phải nhân bản
 * đúng đoạn giải mã, mà đó là đoạn không được sai.
 */
export class PrismaAppDirectory implements AppDirectoryReader, AppDirectoryAdmin, AppCredentialProvider {
  async listAppsForUser(user: AuthenticatedUser): Promise<Result<FirebaseAppSummary[]>> {
    return attemptAsync(async () => {
      if (user.role === 'ADMIN') {
        const rows = await prisma.firebaseApp.findMany({ orderBy: { displayName: 'asc' } })
        return rows.map((row) => toSummary(row, 'PUBLISHER'))
      }

      const memberships = await prisma.appMembership.findMany({
        where: { userId: user.id },
        include: { app: true },
        orderBy: { app: { displayName: 'asc' } },
      })
      return memberships.map((membership) => toSummary(membership.app, asAppRole(membership.role)))
    }, 'Không đọc được danh sách app.')
  }

  async getAppForUser(
    user: AuthenticatedUser,
    slug: string,
  ): Promise<Result<{ app: FirebaseAppSummary; access: AppAccess | null }>> {
    const loaded = await attemptAsync(
      () =>
        prisma.firebaseApp.findUnique({
          where: { slug },
          include: { memberships: { where: { userId: user.id } } },
        }),
      'Không đọc được thông tin app.',
    )
    if (!loaded.ok) return loaded

    const row = loaded.value
    // Không phân biệt "không tồn tại" với "không có quyền": phân biệt hai cái
    // đó cho phép người ngoài dò xem slug nào có thật.
    if (row === null) return err(AppErrors.notFound(`Không tìm thấy app "${slug}".`))

    const membership = row.memberships[0]
    if (user.role !== 'ADMIN' && membership === undefined) {
      return err(AppErrors.forbidden(`Bạn không có quyền truy cập app "${slug}".`))
    }

    const role: AppRole = user.role === 'ADMIN' ? 'PUBLISHER' : asAppRole(membership?.role ?? 'VIEWER')
    const access: AppAccess | null =
      membership === undefined && user.role !== 'ADMIN'
        ? null
        : { appId: row.id, appSlug: row.slug, role }

    return ok({ app: toSummary(row, role), access })
  }

  async createApp(input: CreateAppInput): Promise<Result<FirebaseAppSummary>> {
    const existing = await attemptAsync(() => prisma.firebaseApp.findUnique({ where: { slug: input.slug } }))
    if (!existing.ok) return existing
    if (existing.value !== null) {
      return err(AppErrors.validation(`Định danh "${input.slug}" đã được dùng cho app khác.`))
    }

    return attemptAsync(async () => {
      const row = await prisma.firebaseApp.create({
        data: {
          slug: input.slug,
          displayName: input.displayName,
          projectId: input.projectId,
          packageName: input.packageName ?? null,
          createdById: input.createdById,
        },
      })
      return toSummary(row, 'PUBLISHER')
    }, 'Không tạo được app.')
  }

  async setPackageName(slug: string, packageName: string | null): Promise<Result<FirebaseAppSummary>> {
    return attemptAsync(async () => {
      const row = await prisma.firebaseApp.update({ where: { slug }, data: { packageName } })
      return toSummary(row, 'PUBLISHER')
    }, 'Không lưu được package name.')
  }

  async setCredential(slug: string, serviceAccountJson: string): Promise<Result<FirebaseAppSummary>> {
    const parsed = parseServiceAccount(serviceAccountJson)
    if (!parsed.ok) return parsed

    const loaded = await attemptAsync(() => prisma.firebaseApp.findUnique({ where: { slug } }))
    if (!loaded.ok) return loaded
    if (loaded.value === null) return err(AppErrors.notFound(`Không tìm thấy app "${slug}".`))

    if (parsed.value.project_id !== loaded.value.projectId) {
      return err(
        AppErrors.validation(
          `Service account thuộc project "${parsed.value.project_id}" nhưng app này khai project "${loaded.value.projectId}". Nhiều khả năng chọn nhầm tệp.`,
        ),
      )
    }

    const encrypted = encryptCredential(serviceAccountJson)
    if (!encrypted.ok) return encrypted

    if (loaded.value.credentialClientEmail !== null) {
      forgetCachedCredential(loaded.value.credentialClientEmail)
    }

    return attemptAsync(async () => {
      const row = await prisma.firebaseApp.update({
        where: { slug },
        data: {
          credentialCiphertext: encrypted.value,
          credentialClientEmail: parsed.value.client_email,
        },
      })
      return toSummary(row, 'PUBLISHER')
    }, 'Không lưu được service account.')
  }

  async removeCredential(slug: string): Promise<Result<FirebaseAppSummary>> {
    return attemptAsync(async () => {
      const row = await prisma.firebaseApp.update({
        where: { slug },
        data: { credentialCiphertext: null, credentialClientEmail: null },
      })
      if (row.credentialClientEmail !== null) forgetCachedCredential(row.credentialClientEmail)
      return toSummary(row, 'PUBLISHER')
    }, 'Không gỡ được service account.')
  }

  async setMembership(appId: string, userId: string, role: AppRole | null): Promise<Result<void>> {
    return attemptAsync(async () => {
      if (role === null) {
        await prisma.appMembership.deleteMany({ where: { appId, userId } })
        return undefined
      }
      await prisma.appMembership.upsert({
        where: { userId_appId: { userId, appId } },
        create: { appId, userId, role },
        update: { role },
      })
      return undefined
    }, 'Không cập nhật được phân quyền.')
  }

  async listMemberships(appId: string): Promise<Result<{ user: AuthenticatedUser; role: AppRole }[]>> {
    return attemptAsync(async () => {
      const rows = await prisma.appMembership.findMany({ where: { appId }, include: { user: true } })
      return rows.map((row) => ({
        user: {
          id: row.user.id,
          email: row.user.email,
          name: row.user.name,
          role: row.user.role === 'ADMIN' ? ('ADMIN' as const) : ('MEMBER' as const),
        },
        role: asAppRole(row.role),
      }))
    }, 'Không đọc được danh sách phân quyền.')
  }

  async credentialsFor(
    appSlug: string,
  ): Promise<Result<{ projectId: string; serviceAccount: ServiceAccount }>> {
    const loaded = await attemptAsync(() => prisma.firebaseApp.findUnique({ where: { slug: appSlug } }))
    if (!loaded.ok) return loaded

    const row = loaded.value
    if (row === null) return err(AppErrors.notFound(`Không tìm thấy app "${appSlug}".`))
    if (row.credentialCiphertext === null) {
      return err(
        AppErrors.validation(
          `App "${row.displayName}" chưa được gắn service account nên chưa nối được với Firebase.`,
        ),
      )
    }

    const decrypted = decryptCredential(row.credentialCiphertext)
    if (!decrypted.ok) return decrypted

    const serviceAccount = parseServiceAccount(decrypted.value)
    if (!serviceAccount.ok) return serviceAccount

    return ok({ projectId: row.projectId, serviceAccount: serviceAccount.value })
  }
}
