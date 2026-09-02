'use client'

import DownloadIcon from '@mui/icons-material/Download'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import TranslateIcon from '@mui/icons-material/Translate'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { findLanguage } from '@/domain/translation/entities/LanguageCode'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'
import { StringTranslatorViewModel } from './StringTranslatorViewModel'
import { canTranslate, formatBytes, progressRatio } from './StringTranslatorContract'
import type { StringTranslatorEffect } from './StringTranslatorContract'
import { FileDropZone } from './components/FileDropZone'
import { LanguagePicker } from './components/LanguagePicker'
import { TranslationProgress } from './components/TranslationProgress'
import { ValidationReport } from './components/ValidationReport'

export interface StringTranslatorScreenProps {
  /** Nhà cung cấp và model đang cấu hình, ví dụ `openai · gpt-4o-mini`. */
  providerLabel: string
  /** Đã có khoá API chưa. Chưa có thì mọi nút dịch đều vô nghĩa. */
  configured: boolean
  /** Vì sao chưa cấu hình được — chỉ có khi `configured` là false. */
  configurationHint?: string
}

/**
 * Màn Dịch.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, xử lý Effect.
 * Nhìn file này chỉ trả lời được câu "trông nó thế nào" — đúng như mong đợi.
 *
 * Ba bước đánh số, và chúng cố tình hiện hết cùng lúc chứ không phải một trình
 * hướng dẫn từng trang: người dùng thường đổi danh sách ngôn ngữ rồi chạy lại
 * trên cùng một tệp, mà một trình hướng dẫn bắt họ đi lại từ đầu mỗi lần.
 */
export function StringTranslatorScreen({
  providerLabel,
  configured,
  configurationHint,
}: StringTranslatorScreenProps) {
  const state = StringTranslatorViewModel.useState()
  const onIntent = StringTranslatorViewModel.useIntent()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )

  StringTranslatorViewModel.useEffects(
    useCallback((effect: StringTranslatorEffect) => {
      switch (effect.type) {
        case 'ShowMessage':
          setToast({ message: effect.message, severity: effect.severity })
          return

        case 'DownloadArchive': {
          // base64 → byte → Blob. `atob` trả về chuỗi nhị phân, nên phải sao
          // từng byte: đưa thẳng chuỗi đó vào Blob sẽ bị mã hoá lại thành UTF-8
          // và tệp zip hỏng ngay từ chữ ký bốn byte đầu.
          const binary = atob(effect.base64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
          }

          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
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

  const translating = state.status === 'translating'
  const ready = canTranslate(state) && configured

  return (
    <>
      <PageHeader
        eyebrow="Dịch"
        title="strings.xml đa ngôn ngữ"
        subtitle="Nạp một tệp strings.xml, chọn ngôn ngữ, nhận về một tệp .zip đã xếp sẵn theo đúng cấu trúc thư mục values-xx của Android."
        meta={
          <>
            <MetaChip label="mô hình">{providerLabel}</MetaChip>
            <MetaChip label="ngôn ngữ đã chọn">{state.selected.length}</MetaChip>
            {state.report === null ? null : (
              <MetaChip label="chuỗi">{state.report.translatableCount}</MetaChip>
            )}
          </>
        }
      />

      <Stack spacing={7} sx={{ maxWidth: 960 }}>
        {configured ? null : (
          <Alert severity="warning">
            {configurationHint ??
              'Chưa cấu hình khoá API cho mô hình dịch, nên nút dịch chưa dùng được.'}{' '}
            Xem <code>.env.example</code> để biết cần đặt biến nào.
          </Alert>
        )}

        <Step index={1} title="Nạp tệp strings.xml" hint="Tệp được soi ngay tại trình duyệt, chưa gửi đi đâu cả.">
          <Stack spacing={4}>
            <FileDropZone
              fileName={state.fileName}
              disabled={translating}
              onFile={(fileName, content) => onIntent({ type: 'FilePicked', fileName, content })}
              onClear={() => onIntent({ type: 'FileCleared' })}
              onError={(message) => setToast({ message, severity: 'error' })}
            />
            {state.report === null ? null : <ValidationReport report={state.report} />}
          </Stack>
        </Step>

        <Step
          index={2}
          title="Ngữ cảnh và ngôn ngữ"
          hint="Tên app đi vào prompt làm ngữ cảnh — cùng một từ tiếng Anh dịch khác nhau tuỳ app."
        >
          <Stack spacing={5}>
            <TextField
              label="Tên dòng app"
              placeholder="Ví dụ: BloodSugar, AI Photo Editor"
              value={state.appName}
              disabled={translating}
              onChange={(event) => onIntent({ type: 'AppNameChanged', value: event.target.value })}
              helperText='Bỏ trống cũng dịch được, nhưng mô hình sẽ đoán ngữ cảnh. "Rate" trong app đo nhịp tim và trong app cho vay là hai từ khác nhau.'
              size="small"
              sx={{ maxWidth: 460 }}
            />
            <LanguagePicker
              selected={state.selected}
              disabled={translating}
              onToggle={(code) => onIntent({ type: 'LanguageToggled', code })}
              onToggleAll={(value) => onIntent({ type: 'AllLanguagesToggled', value })}
            />
          </Stack>
        </Step>

        <Step index={3} title="Dịch và tải về" hint="Mỗi ngôn ngữ chạy độc lập; một ngôn ngữ hỏng không kéo theo phần còn lại.">
          <Stack spacing={5}>
            <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="contained"
                startIcon={translating ? <CircularProgress size={16} color="inherit" /> : <TranslateIcon />}
                disabled={!ready}
                onClick={() => onIntent({ type: 'TranslateRequested' })}
              >
                {translating ? 'Đang dịch…' : `Dịch sang ${state.selected.length} ngôn ngữ`}
              </Button>

              {translating ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopCircleIcon />}
                  onClick={() => onIntent({ type: 'TranslationCancelled' })}
                >
                  Dừng
                </Button>
              ) : null}

              {state.archive === null ? null : (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<DownloadIcon />}
                  onClick={() => onIntent({ type: 'DownloadRequested' })}
                >
                  Tải tệp .zip ({formatBytes(state.archive.byteLength)})
                </Button>
              )}
            </Stack>

            {state.xml === null ? (
              <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
                Chọn tệp ở bước 1 trước đã.
              </Typography>
            ) : null}

            {translating || state.finished.length > 0 ? (
              <TranslationProgress
                finished={state.finished}
                running={state.running}
                ratio={progressRatio(state)}
              />
            ) : null}

            {state.error === null ? null : (
              <Alert severity="error">
                {state.error.message}
                {state.error.detail === undefined ? null : (
                  <Box component="span" sx={{ ...m3Mono.chip, textTransform: 'none', display: 'block', mt: 1 }}>
                    {state.error.detail}
                  </Box>
                )}
              </Alert>
            )}

            {state.failed.length === 0 ? null : (
              <Alert severity="warning">
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  {state.failed.length} ngôn ngữ chưa trọn vẹn
                </Typography>
                <Stack component="ul" sx={{ m: 0, pl: 4, gap: 0.5 }}>
                  {state.failed.map((failure) => (
                    <Typography component="li" variant="caption" key={failure.code}>
                      <strong>{findLanguage(failure.code)?.label ?? failure.code}</strong> — {failure.message}
                    </Typography>
                  ))}
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  Tệp zip vẫn tải về được. Những chuỗi thiếu sẽ tự lấy từ thư mục values gốc, nên app
                  không vỡ — nhưng nên bỏ chọn các ngôn ngữ khác rồi chạy lại riêng chúng.
                </Typography>
              </Alert>
            )}

            {state.status === 'done' && state.failed.length === 0 ? (
              <Alert severity="success">
                Xong {state.selected.length} ngôn ngữ. Giải nén tệp zip rồi chép các thư mục{' '}
                <code>values-xx</code> vào <code>app/src/main/res/</code>.
              </Alert>
            ) : null}
          </Stack>
        </Step>
      </Stack>

      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast === null ? undefined : (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </>
  )
}

/**
 * Một bước, có số thứ tự.
 *
 * Cục bộ trong file này chứ không đưa vào `ui/`: nó chỉ có nghĩa trong một
 * luồng ba bước, và một component dùng chung được rút ra từ đúng MỘT chỗ dùng
 * thường sai ngay ở chỗ thứ hai.
 */
function Step({
  index,
  title,
  hint,
  children,
}: {
  index: number
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <Box component="section">
      <Stack direction="row" sx={{ gap: 3, alignItems: 'flex-start', mb: 4 }}>
        <Box
          aria-hidden
          sx={{
            flex: 'none',
            width: 26,
            height: 26,
            borderRadius: '50%',
            backgroundColor: m3('primaryContainer'),
            color: m3('onPrimaryContainer'),
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          {index}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4">{title}</Typography>
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 1, maxWidth: '68ch' }}>
            {hint}
          </Typography>
        </Box>
      </Stack>
      <Box
        sx={{
          ml: { xs: 0, sm: '38px' },
          p: 5,
          border: `1px solid ${m3('outlineVariant')}`,
          borderRadius: `${m3Shape.medium}px`,
          backgroundColor: m3('surface'),
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
