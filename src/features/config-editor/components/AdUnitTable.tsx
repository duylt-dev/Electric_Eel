'use client'

import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'

import { AD_TYPES, AD_TYPE_LABEL } from '@/domain/ads/entities/AdType'
import { AD_UNIT_ID_PATTERN, DEMO_AD_UNIT_ID } from '@/domain/ads/entities/AdmobIdDocument'
import type { AdUnit, AdmobIdDocument } from '@/domain/ads/entities/AdmobIdDocument'
import type { Finding } from '@/domain/ads/validation/Finding'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'
import { FindingList } from './FindingList'

export interface AdUnitTableProps {
  document: AdmobIdDocument
  findings: readonly Finding[]
  readOnly: boolean
  onChange: (spaceName: string, patch: Partial<AdUnit>) => void
  onAdd: (unit: AdUnit) => void
  onRemove: (spaceName: string) => void
  onRootChange: (field: string, value: unknown) => void
}

/**
 * Bảng ad unit.
 *
 * Bảng chứ không phải biểu mẫu từng cái một: 72 ad unit, và việc thường làm
 * nhất là dò xem mã nào sai hoặc thiếu. Dạng bảng cho phép quét dọc theo cột
 * mã — đúng cách mắt người tìm ra chỗ lệch.
 */
export function AdUnitTable({
  document,
  findings,
  readOnly,
  onChange,
  onAdd,
  onRemove,
  onRootChange,
}: AdUnitTableProps) {
  const [search, setSearch] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftType, setDraftType] = useState<string>('native')

  const findingsBySpace = useMemo(() => {
    const map = new Map<string, Finding[]>()
    for (const finding of findings) {
      if (finding.path.scope !== 'adUnit') continue
      const bucket = map.get(finding.path.spaceName)
      if (bucket === undefined) map.set(finding.path.spaceName, [finding])
      else bucket.push(finding)
    }
    return map
  }, [findings])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) return document.listAds
    return document.listAds.filter(
      (unit) =>
        unit.spaceName.toLowerCase().includes(query) || unit.id.toLowerCase().includes(query),
    )
  }, [document.listAds, search])

  const rootFindings = findings.filter((finding) => finding.path.scope === 'admobRoot')

  const addUnit = () => {
    const spaceName = draftName.trim()
    if (spaceName.length === 0) return
    onAdd({ spaceName, adsType: draftType, id: '' })
    setDraftName('')
  }

  return (
    <Stack spacing={5}>
      <Box
        sx={{
          p: 4,
          borderRadius: `${m3Shape.medium}px`,
          bgcolor: m3('surfaceContainerLow'),
          border: `1px solid ${m3('outlineVariant')}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ mb: 3 }}>
          Thông tin ứng dụng
        </Typography>

        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <TextField
            label="AdMob App ID"
            value={document.appId}
            onChange={(event) => onRootChange('appId', event.target.value)}
            disabled={readOnly}
            helperText="Dạng ca-app-pub-<16 số>~<10 số>. Dấu ngã, không phải gạch chéo."
            fullWidth
          />
          <TextField
            label="Package name"
            value={document.package}
            onChange={(event) => onRootChange('package', event.target.value)}
            disabled={readOnly}
            helperText="Package của app Android, để đối chiếu khi nhiều app dùng chung tool."
            fullWidth
          />
        </Box>

        {rootFindings.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <FindingList findings={rootFindings} />
          </Box>
        )}
      </Box>

      <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        <TextField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo spaceName hoặc mã"
          sx={{ minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
          {rows.length === document.listAds.length
            ? `${document.listAds.length} ad unit`
            : `${rows.length} / ${document.listAds.length} ad unit`}
        </Typography>
      </Stack>

      <Box sx={{ overflowX: 'auto', border: `1px solid ${m3('outlineVariant')}`, borderRadius: `${m3Shape.medium}px` }}>
        <Table size="small" sx={{ minWidth: 860 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 260 }}>spaceName</TableCell>
              <TableCell sx={{ width: 180 }}>Kiểu</TableCell>
              <TableCell>Mã ad unit</TableCell>
              <TableCell sx={{ width: 90 }}>Buffer</TableCell>
              <TableCell sx={{ width: 56 }} />
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((unit) => {
              const problems = findingsBySpace.get(unit.spaceName) ?? []
              const badId = unit.id !== DEMO_AD_UNIT_ID && !AD_UNIT_ID_PATTERN.test(unit.id)

              return (
                <TableRow key={unit.spaceName} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: MONO_FONT_STACK }}>
                      {unit.spaceName}
                    </Typography>
                    {problems.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <FindingList findings={problems} />
                      </Box>
                    )}
                  </TableCell>

                  <TableCell>
                    <TextField
                      select
                      value={unit.adsType}
                      onChange={(event) => onChange(unit.spaceName, { adsType: event.target.value })}
                      disabled={readOnly}
                      size="small"
                      fullWidth
                    >
                      {AD_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>
                          {AD_TYPE_LABEL[type]}
                        </MenuItem>
                      ))}
                      {!AD_TYPES.some((type) => type === unit.adsType) && (
                        <MenuItem value={unit.adsType}>{unit.adsType} (SDK không hiểu)</MenuItem>
                      )}
                    </TextField>
                  </TableCell>

                  <TableCell>
                    <TextField
                      value={unit.id}
                      onChange={(event) => onChange(unit.spaceName, { id: event.target.value })}
                      disabled={readOnly}
                      error={badId}
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { style: { fontFamily: MONO_FONT_STACK, fontSize: 13 } } }}
                    />
                  </TableCell>

                  <TableCell>
                    <TextField
                      type="number"
                      value={unit.buffer ?? ''}
                      onChange={(event) =>
                        onChange(unit.spaceName, {
                          buffer: event.target.value === '' ? undefined : Number(event.target.value),
                        })
                      }
                      disabled={readOnly}
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { min: 1, max: 10 } }}
                    />
                  </TableCell>

                  <TableCell>
                    <Tooltip title="Xoá ad unit">
                      <span>
                        <IconButton
                          size="small"
                          disabled={readOnly}
                          onClick={() => onRemove(unit.spaceName)}
                          aria-label={`Xoá ${unit.spaceName}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )
            })}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 3 }}>
                    Không có ad unit nào khớp.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      {!readOnly && (
        <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 3 }}>
          <TextField
            label="spaceName mới"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            helperText="Quy ước: configName + &quot;_&quot; + hậu tố, ví dụ home-bottom_native"
            sx={{ minWidth: 300 }}
          />
          <TextField
            select
            label="Kiểu"
            value={draftType}
            onChange={(event) => setDraftType(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            {AD_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {AD_TYPE_LABEL[type]}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={addUnit} sx={{ mt: 1 }}>
            Thêm ad unit
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
