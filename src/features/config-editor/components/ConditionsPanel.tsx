'use client'

import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import type { ParameterState } from '@/domain/ads/AdsWorkspace'
import {
  ALWAYS_TRUE_EXPRESSION,
  isFullyStructured,
  parseExpression,
  serializeExpression,
} from '@/domain/remote-config/entities/ConditionExpression'
import type { ConditionClause } from '@/domain/remote-config/entities/ConditionExpression'
import { TAG_COLORS } from '@/domain/remote-config/entities/RemoteConfigTemplate'
import type { RemoteConfigCondition, TagColor } from '@/domain/remote-config/entities/RemoteConfigTemplate'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Quản lý điều kiện — tầng multi-value của Firebase.
 *
 * Hai điều quan trọng mà giao diện này phải nói ra, vì cả hai đều vô hình trên
 * console Firebase:
 *
 *   1. THỨ TỰ QUYẾT ĐỊNH KẾT QUẢ. Với một tham số, Firebase lấy giá trị của
 *      điều kiện đầu tiên khớp. Nên danh sách được đánh số và có nút đổi chỗ,
 *      chứ không phải một đống thẻ xếp tuỳ ý.
 *   2. CÓ ĐIỀU KIỆN KHÔNG CÓ NGHĨA LÀ CÓ GIÁ TRỊ RIÊNG. Mỗi điều kiện hiện rõ
 *      tham số nào đang có bản riêng cho nó, tham số nào đang dùng chung bản
 *      mặc định.
 */
export interface ConditionsPanelProps {
  conditions: readonly RemoteConfigCondition[]
  admob: ParameterState<unknown>
  showAds: ParameterState<unknown>
  readOnly: boolean
  onSave: (condition: RemoteConfigCondition, previousName?: string) => void
  onRemove: (name: string) => void
  onMove: (from: number, to: number) => void
  onCreateOverride: (parameter: 'admob' | 'showAds', conditionName: string) => void
  onClearOverride: (parameter: 'admob' | 'showAds', conditionName: string) => void
}

export function ConditionsPanel({
  conditions,
  admob,
  showAds,
  readOnly,
  onSave,
  onRemove,
  onMove,
  onCreateOverride,
  onClearOverride,
}: ConditionsPanelProps) {
  const [editing, setEditing] = useState<{ condition: RemoteConfigCondition; original?: string } | null>(
    null,
  )

  const hasOverride = (state: ParameterState<unknown>, name: string): boolean =>
    state.variants.some((variant) => variant.conditionName === name)

  return (
    <Stack spacing={5}>
      <Alert severity="info" sx={{ bgcolor: m3('surfaceContainerHigh'), color: m3('onSurface') }}>
        Firebase áp dụng điều kiện <strong>đầu tiên khớp</strong>, xét từ trên xuống. Đổi thứ tự là đổi
        hành vi của app, kể cả khi không sửa gì trong biểu thức.
      </Alert>

      <Stack spacing={3}>
        {conditions.map((condition, index) => {
          const clauses = parseExpression(condition.expression)
          const structured = isFullyStructured(clauses)

          return (
            <Box
              key={condition.name}
              sx={{
                p: 4,
                borderRadius: `${m3Shape.medium}px`,
                bgcolor: m3('surfaceContainerLow'),
                border: `1px solid ${m3('outlineVariant')}`,
              }}
            >
              <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Chip size="small" label={`#${index + 1}`} variant="outlined" />
                <Typography variant="subtitle1">{condition.name}</Typography>
                {!structured && (
                  <Tooltip title="Tool chưa hiểu hết biểu thức này nên chỉ cho sửa dạng chữ. Nội dung được giữ nguyên, không bị viết lại.">
                    <Chip size="small" label="Biểu thức tự viết" variant="outlined" />
                  </Tooltip>
                )}

                <Box sx={{ flex: 1 }} />

                <Tooltip title="Lên một bậc">
                  <span>
                    <IconButton
                      size="small"
                      disabled={readOnly || index === 0}
                      onClick={() => onMove(index, index - 1)}
                      aria-label={`Đưa ${condition.name} lên trên`}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Xuống một bậc">
                  <span>
                    <IconButton
                      size="small"
                      disabled={readOnly || index === conditions.length - 1}
                      onClick={() => onMove(index, index + 1)}
                      aria-label={`Đưa ${condition.name} xuống dưới`}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  disabled={readOnly}
                  onClick={() => setEditing({ condition, original: condition.name })}
                >
                  Sửa
                </Button>
                <Tooltip title="Xoá điều kiện và mọi giá trị riêng gắn với nó">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={readOnly}
                      onClick={() => onRemove(condition.name)}
                      aria-label={`Xoá ${condition.name}`}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>

              <Box
                component="pre"
                sx={{
                  mt: 3,
                  mb: 3,
                  p: 3,
                  borderRadius: `${m3Shape.small}px`,
                  bgcolor: m3('surfaceContainer'),
                  border: `1px solid ${m3('outlineVariant')}`,
                  fontFamily: MONO_FONT_STACK,
                  fontSize: 13,
                  overflowX: 'auto',
                }}
              >
                {condition.expression}
              </Box>

              <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', gap: 2 }}>
                <OverrideToggle
                  label="config_show_ads"
                  active={hasOverride(showAds, condition.name)}
                  readOnly={readOnly}
                  onCreate={() => onCreateOverride('showAds', condition.name)}
                  onClear={() => onClearOverride('showAds', condition.name)}
                />
                <OverrideToggle
                  label="admob_id"
                  active={hasOverride(admob, condition.name)}
                  readOnly={readOnly}
                  onCreate={() => onCreateOverride('admob', condition.name)}
                  onClear={() => onClearOverride('admob', condition.name)}
                />
              </Stack>
            </Box>
          )
        })}

        {conditions.length === 0 && (
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
            Chưa có điều kiện nào. Mọi thiết bị đều nhận cùng một cấu hình.
          </Typography>
        )}
      </Stack>

      {!readOnly && (
        <Box>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() =>
              setEditing({
                condition: { name: '', expression: ALWAYS_TRUE_EXPRESSION, tagColor: 'BLUE' },
              })
            }
          >
            Thêm điều kiện
          </Button>
        </Box>
      )}

      {editing !== null && (
        <ConditionDialog
          initial={editing.condition}
          originalName={editing.original}
          existingNames={conditions.map((condition) => condition.name)}
          onCancel={() => setEditing(null)}
          onSave={(condition) => {
            onSave(condition, editing.original)
            setEditing(null)
          }}
        />
      )}
    </Stack>
  )
}

function OverrideToggle({
  label,
  active,
  readOnly,
  onCreate,
  onClear,
}: {
  label: string
  active: boolean
  readOnly: boolean
  onCreate: () => void
  onClear: () => void
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" sx={{ fontFamily: MONO_FONT_STACK }}>
        {label}
      </Typography>
      {active ? (
        <>
          <Chip
            size="small"
            label="có giá trị riêng"
            sx={{ bgcolor: m3('secondaryContainer'), color: m3('onSecondaryContainer') }}
          />
          <Button size="small" disabled={readOnly} onClick={onClear}>
            Về mặc định
          </Button>
        </>
      ) : (
        <>
          <Chip size="small" label="dùng bản mặc định" variant="outlined" />
          <Button size="small" disabled={readOnly} onClick={onCreate}>
            Tạo giá trị riêng
          </Button>
        </>
      )}
    </Stack>
  )
}

/**
 * Hộp thoại soạn điều kiện.
 *
 * Có hai chế độ và người dùng thấy rõ mình đang ở chế độ nào. Chế độ có cấu
 * trúc dựng biểu thức từ ô chọn; chế độ chữ cho gõ thẳng. Chuyển giữa hai chế
 * độ không làm mất nội dung — biểu thức luôn hiện nguyên văn ở dưới, đúng chuỗi
 * sẽ gửi lên Firebase.
 */
function ConditionDialog({
  initial,
  originalName,
  existingNames,
  onCancel,
  onSave,
}: {
  initial: RemoteConfigCondition
  originalName?: string
  existingNames: readonly string[]
  onCancel: () => void
  onSave: (condition: RemoteConfigCondition) => void
}) {
  const [name, setName] = useState(initial.name)
  const [tagColor, setTagColor] = useState<TagColor>(initial.tagColor ?? 'BLUE')
  const [clauses, setClauses] = useState<ConditionClause[]>(() => parseExpression(initial.expression))
  const [rawMode, setRawMode] = useState(() => !isFullyStructured(parseExpression(initial.expression)))
  const [raw, setRaw] = useState(initial.expression)

  const expression = rawMode ? raw : serializeExpression(clauses)

  const duplicate =
    name !== originalName && existingNames.some((existing) => existing === name.trim())
  const nameInvalid = name.trim().length === 0 || duplicate

  const updateClause = (index: number, clause: ConditionClause) =>
    setClauses(clauses.map((existing, position) => (position === index ? clause : existing)))

  return (
    <Dialog open onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{originalName === undefined ? 'Thêm điều kiện' : 'Sửa điều kiện'}</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={4}>
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 3 }}>
            <TextField
              label="Tên điều kiện"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={nameInvalid}
              helperText={
                duplicate
                  ? 'Đã có điều kiện trùng tên.'
                  : 'Tên này xuất hiện trên console Firebase, nên đặt sao cho người khác đọc là hiểu.'
              }
              sx={{ flex: 1, minWidth: 240 }}
            />
            <TextField
              select
              label="Màu nhãn"
              value={tagColor}
              onChange={(event) => setTagColor(event.target.value as TagColor)}
              sx={{ minWidth: 160 }}
            >
              {TAG_COLORS.map((color) => (
                <MenuItem key={color} value={color}>
                  {color}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              size="small"
              variant={rawMode ? 'outlined' : 'contained'}
              onClick={() => {
                setClauses(parseExpression(raw))
                setRawMode(false)
              }}
            >
              Dựng bằng ô chọn
            </Button>
            <Button
              size="small"
              variant={rawMode ? 'contained' : 'outlined'}
              onClick={() => {
                setRaw(serializeExpression(clauses))
                setRawMode(true)
              }}
            >
              Gõ biểu thức
            </Button>
          </Stack>

          {rawMode ? (
            <TextField
              label="Biểu thức"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              multiline
              minRows={3}
              helperText="Cú pháp do Firebase định nghĩa. Firebase sẽ tự kiểm tra biểu thức này khi bạn đẩy cấu hình lên — nếu sai, lỗi hiện ngay và không có gì được ghi."
              slotProps={{ htmlInput: { style: { fontFamily: MONO_FONT_STACK, fontSize: 13 } } }}
              fullWidth
            />
          ) : (
            <Stack spacing={3}>
              {clauses.map((clause, index) => (
                <ClauseEditor
                  key={index}
                  clause={clause}
                  onChange={(next) => updateClause(index, next)}
                  onRemove={() => setClauses(clauses.filter((_, position) => position !== index))}
                />
              ))}

              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setClauses([...clauses, { kind: 'country', countries: ['VN'] }])}
                >
                  Quốc gia
                </Button>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setClauses([...clauses, { kind: 'language', languages: ['vi'] }])}
                >
                  Ngôn ngữ
                </Button>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setClauses([...clauses, { kind: 'platform', os: 'android' }])}
                >
                  Nền tảng
                </Button>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setClauses([...clauses, { kind: 'raw', expression: '' }])}
                >
                  Mệnh đề tự viết
                </Button>
              </Stack>
            </Stack>
          )}

          <Box>
            <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
              Chuỗi sẽ gửi lên Firebase
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 1,
                p: 3,
                borderRadius: `${m3Shape.extraSmall}px`,
                bgcolor: m3('surfaceContainerHighest'),
                fontFamily: MONO_FONT_STACK,
                fontSize: 13,
                overflowX: 'auto',
              }}
            >
              {expression.length === 0 ? '(rỗng)' : expression}
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Huỷ</Button>
        <Button
          variant="contained"
          disabled={nameInvalid || expression.trim().length === 0}
          onClick={() => onSave({ name: name.trim(), expression, tagColor })}
        >
          Lưu
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ClauseEditor({
  clause,
  onChange,
  onRemove,
}: {
  clause: ConditionClause
  onChange: (clause: ConditionClause) => void
  onRemove: () => void
}) {
  const list = (values: string[]) => values.join(', ')
  const parseList = (value: string) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1 }}>
        {clause.kind === 'country' && (
          <TextField
            label="Mã quốc gia"
            value={list(clause.countries)}
            onChange={(event) => onChange({ kind: 'country', countries: parseList(event.target.value) })}
            helperText="Danh sách mã ISO, cách nhau bởi dấu phẩy. Ví dụ: VN, US, ID"
            fullWidth
          />
        )}
        {clause.kind === 'language' && (
          <TextField
            label="Mã ngôn ngữ"
            value={list(clause.languages)}
            onChange={(event) => onChange({ kind: 'language', languages: parseList(event.target.value) })}
            helperText="Ví dụ: vi, en, en-US"
            fullWidth
          />
        )}
        {clause.kind === 'platform' && (
          <TextField
            select
            label="Nền tảng"
            value={clause.os}
            onChange={(event) => onChange({ kind: 'platform', os: event.target.value })}
            fullWidth
          >
            <MenuItem value="android">Android</MenuItem>
            <MenuItem value="ios">iOS</MenuItem>
          </TextField>
        )}
        {clause.kind === 'appId' && (
          <TextField
            label="App ID trên Firebase"
            value={clause.appId}
            onChange={(event) => onChange({ kind: 'appId', appId: event.target.value })}
            fullWidth
          />
        )}
        {clause.kind === 'raw' && (
          <TextField
            label="Mệnh đề tự viết"
            value={clause.expression}
            onChange={(event) => onChange({ kind: 'raw', expression: event.target.value })}
            helperText="Giữ nguyên văn, tool không viết lại. Firebase kiểm tra khi publish."
            slotProps={{ htmlInput: { style: { fontFamily: MONO_FONT_STACK, fontSize: 13 } } }}
            fullWidth
          />
        )}
      </Box>

      <IconButton size="small" onClick={onRemove} aria-label="Xoá mệnh đề" sx={{ mt: 1 }}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  )
}
