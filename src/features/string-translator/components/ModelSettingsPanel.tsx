'use client'

import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { LLM_PROVIDERS, LLM_PROVIDER_INFO, maskedKey } from '@/domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '@/domain/translation/entities/LlmProvider'
import { m3, m3Mono } from '@/ui/theme/m3Tokens'
import { activeCredential } from '../StringTranslatorContract'
import type { ModelSettingsState } from '../StringTranslatorContract'

/**
 * Chọn nhà cung cấp, gắn khoá, chọn model.
 *
 * ── Vì sao ô khoá luôn ở dạng che ──
 *
 * Khoá đã gắn hiện thành `••••••••3f9a`: bốn ký tự cuối đủ để người dùng nhận
 * ra mình đang dùng khoá nào, và không đủ để ai đọc lỏm màn hình dùng lại được.
 * Khoá thật không bao giờ quay xuống trình duyệt, kể cả khi tải lại trang — thứ
 * đi xuống chỉ là bốn ký tự đó.
 *
 * ── Vì sao danh sách model nạp lười ──
 *
 * Nạp đúng lúc người dùng mở ô chọn, không nạp lúc dựng trang. Phần lớn lượt
 * vào trang là để bấm dịch bằng đúng model đã chọn từ trước; nạp sẵn nghĩa là
 * mọi lượt vào trang đều tốn một lượt gọi ra ngoài mà không ai nhìn tới kết quả.
 */
export interface ModelSettingsPanelProps {
  settings: ModelSettingsState
  disabled?: boolean
  onProviderChange: (provider: LlmProviderName) => void
  onModelChange: (model: string) => void
  onModelListOpen: () => void
  onKeyDraftChange: (value: string) => void
  onKeySubmit: () => void
}

export function ModelSettingsPanel({
  settings,
  disabled = false,
  onProviderChange,
  onModelChange,
  onModelListOpen,
  onKeyDraftChange,
  onKeySubmit,
}: ModelSettingsPanelProps) {
  const info = LLM_PROVIDER_INFO[settings.provider]
  const credential = activeCredential(settings)
  const busy = disabled || settings.checkingKey

  // Model đang chọn phải luôn nằm trong danh sách, kể cả khi danh sách chưa nạp
  // hoặc nhà cung cấp đã bỏ model đó đi. Thiếu bước này thì MUI vẽ một ô rỗng
  // và người dùng tưởng mình chưa chọn gì.
  const options =
    settings.models.includes(credential.model) || credential.model.length === 0
      ? settings.models
      : [credential.model, ...settings.models]

  return (
    <Stack spacing={4}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={settings.provider}
        disabled={busy}
        onChange={(_event, value: LlmProviderName | null) => {
          // `null` khi người dùng bấm lại đúng nút đang chọn. Bỏ qua: đây không
          // phải nhóm nút bật/tắt được, luôn phải có đúng một bên được chọn.
          if (value !== null) onProviderChange(value)
        }}
      >
        {LLM_PROVIDERS.map((provider) => (
          <ToggleButton key={provider} value={provider} sx={{ textTransform: 'none', px: 4 }}>
            {LLM_PROVIDER_INFO[provider].label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          label={credential.hasKey ? 'Khoá API đang dùng' : 'Khoá API của bạn'}
          type="password"
          size="small"
          disabled={busy}
          value={settings.keyDraft}
          placeholder={credential.hasKey ? maskedKey(credential.keyHint) : `${info.keyPrefix}…`}
          onChange={(event) => onKeyDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && settings.keyDraft.trim().length > 0) {
              event.preventDefault()
              onKeySubmit()
            }
          }}
          error={settings.keyNotice !== null}
          helperText={
            settings.keyNotice ??
            (credential.hasKey
              ? 'Dán khoá mới vào đây để thay khoá đang dùng.'
              : 'Khoá đi thẳng tới nhà cung cấp và không hiện lại trên màn hình.')
          }
          sx={{ flex: '1 1 340px', minWidth: 260 }}
          slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
        />

        <Button
          variant={credential.hasKey ? 'outlined' : 'contained'}
          disabled={busy || settings.keyDraft.trim().length === 0}
          startIcon={settings.checkingKey ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={onKeySubmit}
          sx={{ mt: 1 }}
        >
          {settings.checkingKey ? 'Đang kiểm…' : credential.hasKey ? 'Đổi khoá' : 'Kiểm tra khoá'}
        </Button>
      </Stack>

      {credential.hasKey ? (
        <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField
            select
            label="Model"
            size="small"
            disabled={busy}
            value={credential.model}
            onChange={(event) => onModelChange(event.target.value)}
            slotProps={{ select: { onOpen: onModelListOpen } }}
            helperText={
              settings.loadingModels
                ? 'Đang lấy danh sách model…'
                : settings.modelsFor === settings.provider
                  ? `${settings.models.length} model khoá này dùng được.`
                  : 'Mở danh sách để lấy các model khoá này dùng được.'
            }
            sx={{ flex: '1 1 340px', minWidth: 260 }}
          >
            {options.map((model) => (
              <MenuItem key={model} value={model} sx={{ ...m3Mono.chip, textTransform: 'none' }}>
                {model}
              </MenuItem>
            ))}
          </TextField>

          <Tooltip title="Lấy lại danh sách model">
            <span>
              <IconButton
                aria-label="Lấy lại danh sách model"
                disabled={busy || settings.loadingModels}
                onClick={onModelListOpen}
                sx={{ mt: 1 }}
              >
                {settings.loadingModels ? <CircularProgress size={18} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ) : null}

      {credential.hasKey ? (
        <Stack direction="row" sx={{ gap: 2, alignItems: 'center', color: m3('onSurfaceVariant') }}>
          <CheckCircleIcon fontSize="small" sx={{ color: m3('primary') }} />
          <Typography variant="caption">
            Đang dùng khoá{' '}
            <Box component="span" sx={{ ...m3Mono.chip, textTransform: 'none' }}>
              {maskedKey(credential.keyHint)}
            </Box>{' '}
            của {info.label}.
          </Typography>
        </Stack>
      ) : (
        <Alert severity="info">
          Công cụ này dùng khoá API của chính bạn, nên hạn mức và chi phí tính vào tài khoản của
          bạn chứ không dùng chung với ai. Tạo khoá tại{' '}
          <Link href={info.keyUrl} target="_blank" rel="noopener noreferrer">
            {info.keyUrl}
          </Link>
          , dán vào ô trên rồi bấm “Kiểm tra khoá”.
        </Alert>
      )}
    </Stack>
  )
}
