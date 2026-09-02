'use client'

import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import UploadIcon from '@mui/icons-material/Upload'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo, useRef, useState } from 'react'

import { buildAdsDiff } from '@/domain/ads/AdsDiff'
import { DEFAULT_VARIANT_LABEL } from '@/domain/ads/AdsWorkspace'
import type { ParameterName } from '@/domain/ads/WorkspaceEdits'
import { matchConfigName } from '@/domain/ads/entities/AdmobIdDocument'
import type { Finding } from '@/domain/ads/validation/Finding'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'
import { ConfigEditorViewModel } from './ConfigEditorViewModel'
import { currentResolved, hasUnsavedChanges, visiblePlacements } from './ConfigEditorContract'
import type { ConfigEditorEffect, EditorTab } from './ConfigEditorContract'
import { AdUnitTable } from './components/AdUnitTable'
import { ConditionsPanel } from './components/ConditionsPanel'
import { DiffDialog } from './components/DiffDialog'
import { FindingSummaryChips } from './components/FindingList'
import { GlobalSettings } from './components/GlobalSettings'
import { PlacementForm } from './components/PlacementForm'
import { PlacementList } from './components/PlacementList'

const TAB_LABEL: Record<EditorTab, string> = {
  placements: 'Vị trí quảng cáo',
  adUnits: 'Ad unit',
  global: 'Cấu hình chung',
  conditions: 'Điều kiện',
}

export interface ConfigEditorScreenProps {
  appName: string
  projectId: string
  /** Quyền của người đang đăng nhập trên app này. */
  canEdit: boolean
  canPublish: boolean
}

/**
 * Màn hình soạn cấu hình.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, và xử lý Effect.
 * Mọi quyết định "khi bấm nút này thì điều gì xảy ra" nằm trong ViewModel.
 * Nhìn vào file này chỉ trả lời được câu "trông nó thế nào", đúng như mong đợi.
 */
export function ConfigEditorScreen({ appName, projectId, canEdit, canPublish }: ConfigEditorScreenProps) {
  const state = ConfigEditorViewModel.useState()
  const onIntent = ConfigEditorViewModel.useIntent()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )
  const [diffOpen, setDiffOpen] = useState(false)
  const [importMenu, setImportMenu] = useState<HTMLElement | null>(null)
  const [exportMenu, setExportMenu] = useState<HTMLElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const importTarget = useRef<ParameterName>('showAds')

  // Thu Effect. `collect` chứ không phải `collectLatest`: mỗi thông báo đều
  // phải tới nơi, kể cả khi hai cái phát ra sát nhau.
  ConfigEditorViewModel.useEffects(
    useCallback((effect: ConfigEditorEffect) => {
      switch (effect.type) {
        case 'ShowMessage':
          setToast({
            message: effect.message,
            severity: effect.severity === 'success' ? 'success' : effect.severity === 'error' ? 'error' : 'info',
          })
          return
        case 'PublishSucceeded':
          setDiffOpen(false)
          return
        case 'DownloadFile': {
          const blob = new Blob([effect.content], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = effect.fileName
          anchor.click()
          URL.revokeObjectURL(url)
          return
        }
      }
    }, []),
  )

  const resolved = currentResolved(state)
  const readOnly = !canEdit

  const findingsByPlacement = useMemo(() => {
    const map = new Map<string, Finding[]>()
    for (const finding of resolved?.validation.findings ?? []) {
      if (finding.path.scope !== 'placement') continue
      const bucket = map.get(finding.path.configName)
      if (bucket === undefined) map.set(finding.path.configName, [finding])
      else bucket.push(finding)
    }
    return map
  }, [resolved])

  const placements = visiblePlacements(state)
  const selectedPlacement = resolved?.showAds?.listConfig.find(
    (placement) => placement.configName === state.selectedPlacement,
  )

  const unitsForSelected = useMemo(() => {
    if (selectedPlacement === undefined || resolved?.admob == null) return []
    const names = resolved.showAds?.listConfig.map((placement) => placement.configName) ?? []
    return resolved.admob.listAds.filter(
      (unit) => matchConfigName(unit.spaceName, names)?.configName === selectedPlacement.configName,
    )
  }, [resolved, selectedPlacement])

  const diff = useMemo(() => {
    const before = state.original?.resolved.find((v) => v.conditionName === state.selectedCondition)
    const after = resolved
    return buildAdsDiff(
      { admob: before?.admob ?? null, showAds: before?.showAds ?? null },
      { admob: after?.admob ?? null, showAds: after?.showAds ?? null },
    )
  }, [state.original, state.selectedCondition, resolved])

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Stack sx={{ alignItems: 'center', py: 20 }} spacing={4}>
        <CircularProgress />
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          Đang tải cấu hình từ Firebase…
        </Typography>
      </Stack>
    )
  }

  if (state.status === 'failed' || state.draft === null) {
    return (
      <Stack spacing={4} sx={{ maxWidth: 640 }}>
        <Alert severity="error">{state.error?.message ?? 'Không tải được cấu hình.'}</Alert>
        {state.error?.detail !== undefined && (
          <Typography variant="caption" sx={{ fontFamily: MONO_FONT_STACK, color: m3('onSurfaceVariant') }}>
            {state.error.detail}
          </Typography>
        )}
        <Box>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => onIntent({ type: 'Load' })}>
            Thử lại
          </Button>
        </Box>
      </Stack>
    )
  }

  const dirty = hasUnsavedChanges(state)
  const summary = resolved?.validation.summary ?? { error: 0, warning: 0, check: 0, total: 0 }
  const warnings = (resolved?.validation.findings ?? []).filter((finding) => finding.severity === 'warning')

  const openImport = (parameter: ParameterName) => {
    importTarget.current = parameter
    setImportMenu(null)
    fileInput.current?.click()
  }

  return (
    <Stack spacing={5} sx={{ height: '100%', minHeight: 0 }}>
      <PageHeader
        eyebrow="Remote Config"
        title={appName}
        subtitle={
          readOnly
            ? 'Bạn chỉ có quyền xem app này. Sửa được nhưng không đẩy lên được.'
            : 'Sửa cấu hình quảng cáo bằng biểu mẫu. Mọi thay đổi chỉ nằm ở máy bạn cho tới khi bấm đẩy lên.'
        }
        meta={
          <>
            <MetaChip label="project">{projectId}</MetaChip>
            <MetaChip label="vị trí">{resolved?.showAds?.listConfig.length ?? 0}</MetaChip>
            <MetaChip label="ad unit">{resolved?.admob?.listAds.length ?? 0}</MetaChip>
            {readOnly && <StatusChip>chỉ xem</StatusChip>}
            {dirty && (
              <StatusChip tone="warn" dot>
                có thay đổi chưa lưu
              </StatusChip>
            )}
          </>
        }
        actions={
          <>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => onIntent({ type: 'Reload' })}
              disabled={state.publishing}
            >
              Tải lại
            </Button>
            <Button
              variant="contained"
              onClick={() => setDiffOpen(true)}
              disabled={!dirty || !canPublish || state.publishing}
            >
              Xem và đẩy lên
            </Button>
          </>
        }
      />

      <VariantBar
        conditions={state.draft.conditions.map((condition) => condition.name)}
        overridden={new Set(
          [...state.draft.showAds.variants, ...state.draft.admob.variants]
            .map((variant) => variant.conditionName)
            .filter((name): name is string => name !== null),
        )}
        selected={state.selectedCondition}
        onSelect={(conditionName) => onIntent({ type: 'ConditionSelected', conditionName })}
      />

      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        <FindingSummaryChips summary={summary} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<UploadIcon />} onClick={(e) => setImportMenu(e.currentTarget)} disabled={readOnly}>
          Nhập JSON
        </Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={(e) => setExportMenu(e.currentTarget)}>
          Xuất JSON
        </Button>
        {dirty && (
          <Button size="small" color="error" onClick={() => onIntent({ type: 'DiscardChanges' })} disabled={readOnly}>
            Bỏ thay đổi
          </Button>
        )}
      </Stack>

      {state.publishing && <LinearProgress />}

      <Tabs
        value={state.tab}
        onChange={(_event, tab: EditorTab) => onIntent({ type: 'TabSelected', tab })}
        sx={{ borderBottom: `1px solid ${m3('outlineVariant')}` }}
      >
        {(Object.keys(TAB_LABEL) as EditorTab[]).map((tab) => (
          <Tab key={tab} value={tab} label={TAB_LABEL[tab]} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {state.tab === 'placements' && (
          <Stack direction="row" spacing={5} sx={{ height: '100%', minHeight: 480, alignItems: 'stretch' }}>
            <Box
              sx={{
                width: 340,
                flexShrink: 0,
                borderRight: `1px solid ${m3('outlineVariant')}`,
                pr: 4,
              }}
            >
              <PlacementList
                placements={placements}
                totalCount={resolved?.showAds?.listConfig.length ?? 0}
                findingsByPlacement={findingsByPlacement}
                selected={state.selectedPlacement}
                search={state.search}
                filter={state.filter}
                readOnly={readOnly}
                onSearch={(value) => onIntent({ type: 'SearchChanged', value })}
                onFilter={(filter) => onIntent({ type: 'FilterChanged', filter })}
                onSelect={(configName) => onIntent({ type: 'PlacementSelected', configName })}
                onToggle={(configName, isOn) =>
                  onIntent({ type: 'PlacementChanged', configName, patch: { isOn } })
                }
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
              {selectedPlacement === undefined ? (
                <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), p: 4 }}>
                  Chọn một vị trí ở danh sách bên trái để sửa.
                </Typography>
              ) : (
                <PlacementForm
                  placement={selectedPlacement}
                  adUnits={unitsForSelected}
                  findings={findingsByPlacement.get(selectedPlacement.configName) ?? []}
                  readOnly={readOnly}
                  onChange={(patch) =>
                    onIntent({ type: 'PlacementChanged', configName: selectedPlacement.configName, patch })
                  }
                  onClearField={(field) =>
                    onIntent({
                      type: 'PlacementFieldCleared',
                      configName: selectedPlacement.configName,
                      field,
                    })
                  }
                  onRemove={() =>
                    onIntent({ type: 'PlacementRemoved', configName: selectedPlacement.configName })
                  }
                />
              )}
            </Box>
          </Stack>
        )}

        {state.tab === 'adUnits' && resolved?.admob != null && (
          <AdUnitTable
            document={resolved.admob}
            findings={resolved.validation.findings}
            readOnly={readOnly}
            onChange={(spaceName, patch) => onIntent({ type: 'AdUnitChanged', spaceName, patch })}
            onAdd={(unit) => onIntent({ type: 'AdUnitAdded', unit })}
            onRemove={(spaceName) => onIntent({ type: 'AdUnitRemoved', spaceName })}
            onRootChange={(field, value) => onIntent({ type: 'AdmobRootChanged', field, value })}
          />
        )}

        {state.tab === 'global' && resolved?.showAds != null && (
          <GlobalSettings
            document={resolved.showAds}
            findings={resolved.validation.findings}
            readOnly={readOnly}
            onChange={(field, value) => onIntent({ type: 'ShowAdsRootChanged', field, value })}
          />
        )}

        {state.tab === 'conditions' && (
          <ConditionsPanel
            conditions={state.draft.conditions}
            admob={state.draft.admob}
            showAds={state.draft.showAds}
            readOnly={readOnly}
            onSave={(condition, previousName) =>
              onIntent({ type: 'ConditionSaved', condition, ...(previousName !== undefined ? { previousName } : {}) })
            }
            onRemove={(name) => onIntent({ type: 'ConditionRemoved', name })}
            onMove={(from, to) => onIntent({ type: 'ConditionMoved', from, to })}
            onCreateOverride={(parameter, conditionName) =>
              onIntent({ type: 'OverrideCreated', parameter, conditionName })
            }
            onClearOverride={(parameter, conditionName) =>
              onIntent({ type: 'OverrideCleared', parameter, conditionName })
            }
          />
        )}
      </Box>

      <Menu anchorEl={importMenu} open={importMenu !== null} onClose={() => setImportMenu(null)}>
        <MenuItem onClick={() => openImport('showAds')}>Nhập config_show_ads.json</MenuItem>
        <MenuItem onClick={() => openImport('admob')}>Nhập admob_id.json</MenuItem>
      </Menu>

      <Menu anchorEl={exportMenu} open={exportMenu !== null} onClose={() => setExportMenu(null)}>
        <MenuItem
          onClick={() => {
            setExportMenu(null)
            onIntent({ type: 'ExportRequested', parameter: 'showAds' })
          }}
        >
          Xuất config_show_ads.json
        </MenuItem>
        <MenuItem
          onClick={() => {
            setExportMenu(null)
            onIntent({ type: 'ExportRequested', parameter: 'admob' })
          }}
        >
          Xuất admob_id.json
        </MenuItem>
      </Menu>

      <Box
        component="input"
        ref={fileInput}
        type="file"
        accept="application/json,.json,.txt"
        sx={{ display: 'none' }}
        onChange={async (event: React.ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file === undefined) return
          onIntent({ type: 'RawImported', parameter: importTarget.current, raw: (await file.text()).trim() })
        }}
      />

      <DiffDialog
        open={diffOpen}
        diff={diff}
        summary={summary}
        warnings={warnings}
        warningsAcknowledged={state.warningsAcknowledged}
        publishing={state.publishing}
        canPublish={canPublish}
        onAcknowledge={(value) => onIntent({ type: 'WarningsAcknowledged', value })}
        onClose={() => setDiffOpen(false)}
        onPublish={() => onIntent({ type: 'PublishRequested' })}
      />

      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast?.severity ?? 'info'} onClose={() => setToast(null)} variant="filled">
          {toast?.message ?? ''}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

/**
 * Thanh chọn biến thể.
 *
 * Điều kiện chưa có giá trị riêng vẫn hiện ra, nhưng ghi rõ "dùng bản mặc định"
 * — vì đó là câu hỏi người dùng hay nhầm nhất: có điều kiện không có nghĩa là
 * điều kiện đó đang nhận cấu hình khác.
 */
function VariantBar({
  conditions,
  overridden,
  selected,
  onSelect,
}: {
  conditions: readonly string[]
  overridden: ReadonlySet<string>
  selected: string | null
  onSelect: (conditionName: string | null) => void
}) {
  if (conditions.length === 0) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        p: 2,
        border: `1px solid ${m3('outlineVariant')}`,
        borderRadius: `${m3Shape.large}px`,
        bgcolor: m3('surfaceContainerLow'),
      }}
    >
      <Typography sx={{ ...m3Mono.columnHeader, color: m3('onSurfaceVariant'), px: 2 }}>
        Đang xem
      </Typography>

      <Chip
        label={DEFAULT_VARIANT_LABEL}
        onClick={() => onSelect(null)}
        variant={selected === null ? 'filled' : 'outlined'}
        sx={
          selected === null
            ? { bgcolor: m3('secondaryContainer'), color: m3('onSecondaryContainer') }
            : undefined
        }
      />

      <Divider orientation="vertical" flexItem />

      {conditions.map((name) => {
        const active = selected === name
        const hasOwn = overridden.has(name)
        return (
          <Chip
            key={name}
            label={hasOwn ? name : `${name} · dùng bản mặc định`}
            onClick={() => onSelect(name)}
            variant={active ? 'filled' : 'outlined'}
            sx={{
              ...(active ? { bgcolor: m3('secondaryContainer'), color: m3('onSecondaryContainer') } : {}),
              ...(hasOwn ? {} : { opacity: 0.7, borderStyle: 'dashed', borderRadius: `${m3Shape.small}px` }),
            }}
          />
        )
      })}
    </Box>
  )
}
