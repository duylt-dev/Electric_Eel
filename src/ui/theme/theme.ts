'use client'

import { createTheme } from '@mui/material/styles'

import { BODY_FONT_STACK, MONO_FONT_STACK } from './fonts'
import { m3Dark, m3Light } from './generatedPalette'
import { glass, m3, m3Elevation, m3Mono, m3Shape, m3Type } from './m3Tokens'

/**
 * Theme MUI dựng theo Material 3.
 *
 * MUI 9 vẫn là Material Design 2 ở mặc định: nút có bóng, viền vuông hơn, thang
 * chữ khác. Những ghi đè dưới đây kéo nó về M3 ở đúng những chỗ nhìn thấy được
 * — hình dạng, độ nổi, lớp trạng thái, thang chữ.
 *
 * Màu thì đi qua biến CSS trong m3Tokens.ts chứ không qua colorSchemes của MUI,
 * vì hệ màu M3 có nhiều vai trò hơn palette của MUI biểu diễn được. Hai khối
 * `colorSchemes` dưới đây chỉ để MUI biết mình đang ở chế độ sáng hay tối và
 * tự tính được các màu dẫn xuất (viền khi rê chuột, nền khi bị vô hiệu hoá).
 */
export const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: { main: m3Light.primary, contrastText: m3Light.onPrimary },
        secondary: { main: m3Light.secondary, contrastText: m3Light.onSecondary },
        success: { main: m3Light.tertiary, contrastText: m3Light.onTertiary },
        warning: { main: m3Light.warning, contrastText: m3Light.onWarning },
        error: { main: m3Light.error, contrastText: m3Light.onError },
        background: { default: m3Light.surface, paper: m3Light.surfaceContainerLow },
        text: { primary: m3Light.onSurface, secondary: m3Light.onSurfaceVariant },
        divider: m3Light.outlineVariant,
      },
    },
    dark: {
      palette: {
        mode: 'dark',
        primary: { main: m3Dark.primary, contrastText: m3Dark.onPrimary },
        secondary: { main: m3Dark.secondary, contrastText: m3Dark.onSecondary },
        success: { main: m3Dark.tertiary, contrastText: m3Dark.onTertiary },
        warning: { main: m3Dark.warning, contrastText: m3Dark.onWarning },
        error: { main: m3Dark.error, contrastText: m3Dark.onError },
        background: { default: m3Dark.surface, paper: m3Dark.surfaceContainerLow },
        text: { primary: m3Dark.onSurface, secondary: m3Dark.onSurfaceVariant },
        divider: m3Dark.outlineVariant,
      },
    },
  },
  shape: { borderRadius: m3Shape.medium },
  spacing: 4,
  typography: {
    fontFamily: BODY_FONT_STACK,
    h1: m3Type.displaySmall,
    h2: m3Type.headlineLarge,
    h3: m3Type.headlineMedium,
    h4: m3Type.headlineSmall,
    h5: m3Type.titleLarge,
    h6: m3Type.titleMedium,
    subtitle1: m3Type.titleMedium,
    subtitle2: m3Type.titleSmall,
    body1: m3Type.bodyLarge,
    body2: m3Type.bodyMedium,
    caption: m3Type.bodySmall,
    button: { ...m3Type.labelLarge, textTransform: 'none' },
    overline: m3Mono.eyebrow,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: m3('surface'),
          backgroundImage: glass.pageAura,
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
          minHeight: '100dvh',
          color: m3('onSurface'),
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        // Tiêu đề ngắt dòng cho cân hai vế thay vì bỏ lại một từ lẻ ở dòng cuối.
        'h1, h2, h3, h4': { textWrap: 'balance' },
        p: { textWrap: 'pretty' },
        '::selection': { backgroundColor: m3('primaryContainer'), color: m3('onPrimaryContainer') },
        // Vệt focus lấy màu nhấn, và luôn nhìn thấy được trên cả hai nền.
        ':focus-visible': { outline: `2px solid ${m3('primary')}`, outlineOffset: 2 },
        // Thanh cuộn hoà vào nền thay vì cắt một vệt sáng giữa giao diện tối.
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: m3('outlineVariant'),
          borderRadius: m3Shape.full,
          border: `2px solid transparent`,
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // Nút M3 bo tròn hẳn — đây là chi tiết dễ nhận ra nhất giữa M2 và M3.
        root: {
          borderRadius: m3Shape.full,
          paddingInline: 20,
          minHeight: 38,
          boxShadow: 'none',
          fontWeight: 600,
          transition: 'background-color 160ms ease, border-color 160ms ease, transform 160ms ease',
          '&:hover': { transform: 'translateY(-1px)' },
        },
        contained: {
          backgroundImage: 'none',
          backgroundColor: m3('primary'),
          boxShadow: '0 10px 24px -18px rgb(0 122 255 / 0.74)',
          '&:hover': { boxShadow: '0 12px 28px -18px rgb(0 122 255 / 0.78)' },
        },
        outlined: {
          borderColor: glass.border,
          backgroundColor: glass.control,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
        text: { paddingInline: 12 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: m3Shape.full,
          fontWeight: 590,
          backgroundColor: glass.control,
          borderColor: glass.border,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
        outlined: { borderColor: glass.border },
        label: { paddingInline: 10 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: glass.highlight,
          backgroundColor: glass.surface,
          border: `1px solid ${glass.border}`,
          boxShadow: glass.shadow,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
        rounded: { borderRadius: m3Shape.large },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: m3Shape.large,
          backgroundColor: glass.surface,
          backgroundImage: glass.highlight,
          border: `1px solid ${glass.border}`,
          boxShadow: glass.shadow,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: m3Shape.extraLarge,
          backgroundColor: glass.surfaceStrong,
          backgroundImage: glass.highlight,
          border: `1px solid ${glass.border}`,
          boxShadow: m3Elevation[4],
          backdropFilter: glass.blurStrong,
          WebkitBackdropFilter: glass.blurStrong,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: m3Type.headlineSmall } },
    MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: m3Shape.large,
          backgroundColor: glass.control,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
          '&.Mui-focused': {
            backgroundColor: glass.surfaceSoft,
            boxShadow: '0 0 0 4px rgb(0 122 255 / 0.14)',
          },
        },
        input: { fontWeight: 450 },
        notchedOutline: { borderColor: glass.border },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: m3('inverseSurface'),
          color: m3('inverseOnSurface'),
          borderRadius: m3Shape.small,
          ...m3Type.bodySmall,
          paddingInline: 10,
        },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', ...m3Type.titleSmall, minHeight: 48 } } },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: m3Shape.medium,
          border: `1px solid ${glass.border}`,
          backgroundColor: glass.surfaceStrong,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
        message: m3Type.bodyMedium,
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: m3Shape.medium,
          minHeight: 44,
          transition: 'background-color 160ms ease, transform 160ms ease',
          '&:hover': {
            backgroundColor: glass.control,
            transform: 'translateX(1px)',
          },
          '&.Mui-selected': {
            backgroundColor: glass.selected,
            color: m3('onSurface'),
            border: `1px solid ${glass.border}`,
            boxShadow: 'inset 0 1px 0 var(--glass-hairline)',
            '&:hover': { backgroundColor: glass.selected },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: m3('outlineVariant'), paddingBlock: 11 },
        // Đầu cột viết bằng chữ đơn cách, cỡ nhỏ, viết hoa: nó là nhãn của cột
        // chứ không phải một dòng dữ liệu, nên phải khác hẳn phần thân bảng.
        head: {
          ...m3Mono.columnHeader,
          color: m3('onSurfaceVariant'),
          backgroundColor: glass.surfaceStrong,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiLink: { styleOverrides: { root: { color: m3('primary'), textUnderlineOffset: 2 } } },
  },
})

export { m3, m3Elevation, m3Mono, m3Shape, m3Type, MONO_FONT_STACK }
