import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { Metadata } from 'next'

import { canEditApp, canPublishApp } from '@/domain/identity/entities/Permission'
import { requireAppAccess } from '@/lib/session'
import { ConfigEditorRoot } from '@/features/config-editor/ConfigEditorRoot'
import { MetaChip } from '@/ui/components/MetaChip'
import { LinkButton } from '@/ui/components/NavLink'
import { PageHeader } from '@/ui/components/PageHeader'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const access = await requireAppAccess(slug)
  return { title: access.ok ? access.value.app.displayName : 'Không truy cập được' }
}

export default async function ConfigEditorPage({ params }: PageProps) {
  const { slug } = await params

  const access = await requireAppAccess(slug, 'VIEWER')
  if (!access.ok) {
    return (
      <Stack spacing={4} sx={{ maxWidth: 640 }}>
        <Alert severity="error">{access.error.message}</Alert>
        <LinkButton href="/remote-config" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
          Về danh sách app
        </LinkButton>
      </Stack>
    )
  }

  const { user, app, access: appAccess } = access.value

  if (!app.hasCredential) {
    return (
      <>
        <PageHeader
          eyebrow="Remote Config"
          title={app.displayName}
          subtitle="Chưa nối được với Firebase, nên chưa có gì để sửa."
          meta={<MetaChip label="project">{app.projectId}</MetaChip>}
        />
        <Stack spacing={4} sx={{ maxWidth: 720 }}>
          <Alert severity="warning">
            App này chưa được gắn service account nên chưa nối được với Firebase. Cần một service
            account của project <strong>{app.projectId}</strong> có vai trò Firebase Remote Config
            Admin.
          </Alert>
          {user.role === 'ADMIN' && (
            <LinkButton
              href={`/admin/apps/${app.slug}`}
              variant="contained"
              sx={{ alignSelf: 'flex-start' }}
            >
              Gắn service account
            </LinkButton>
          )}
        </Stack>
      </>
    )
  }

  return (
    <ConfigEditorRoot
      appSlug={app.slug}
      appName={app.displayName}
      projectId={app.projectId}
      canEdit={canEditApp(user, appAccess)}
      canPublish={canPublishApp(user, appAccess)}
    />
  )
}
