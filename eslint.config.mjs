import typescriptEslint from '@typescript-eslint/eslint-plugin'
import next from 'eslint-config-next'

/**
 * Ranh giới tầng — bản dịch của hợp đồng kiến trúc bên Android sang web.
 *
 * Mỗi luật dưới đây tương ứng một dòng trong `docs/architecture.md`. Đặt chúng
 * ở đây thay vì chỉ viết trong tài liệu là có chủ đích: một quy ước không được
 * máy kiểm tra thì chỉ sống được vài sprint.
 *
 *   app/       → routing + Route Handler. Mỏng, không chứa logic.
 *   features/  → Contract + ViewModel + Screen của từng màn.
 *   ui/        → design system. Không biết gì về nghiệp vụ.
 *   data/      → adapter. Hiện thực các cổng của domain.
 *   domain/    → thực thể, cổng (interface), use case. Không phụ thuộc framework.
 *   core/      → nguyên thuỷ dùng chung (Result, MVI, DI). Không phụ thuộc gì.
 *   di/        → composition root. Nơi DUY NHẤT được phép nối domain với data.
 */
const layerBoundaries = [
  {
    // domain là tầng trong cùng: không React, không Next, không MUI, không Prisma.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'next', 'next/*', '@mui/*', '@emotion/*', 'zustand', 'zustand/*'],
            message: 'domain/ phải độc lập framework. Đưa thứ này ra tầng data/ hoặc features/.' },
          { group: ['@prisma/client', '@/data/*', '@/features/*', '@/ui/*', '@/app/*'],
            message: 'domain/ chỉ được phụ thuộc vào core/. Phụ thuộc ngược là vi phạm DIP.' },
        ],
      }],
    },
  },
  {
    // core không phụ thuộc bất kỳ tầng nào khác.
    files: ['src/core/**/*.ts', 'src/core/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/domain/*', '@/data/*', '@/features/*', '@/ui/*', '@/app/*', '@/di/*'],
            message: 'core/ là tầng đáy, không được biết tới tầng nào khác.' },
        ],
      }],
    },
  },
  {
    // ViewModel không được chạm vào React hay MUI — đúng luật "no Compose import
    // inside a ViewModel". State đi ra qua hook, không qua import ngược.
    files: ['src/features/**/*ViewModel.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', '@mui/*', '@emotion/*', 'next/navigation', 'next/router'],
            message: 'ViewModel không được import React/MUI. Điều hướng là Effect, không phải lời gọi router.' },
          { group: ['@/data/*'],
            message: 'ViewModel phụ thuộc cổng trong domain/, không phụ thuộc hiện thực trong data/. Lấy qua DI.' },
        ],
      }],
    },
  },
  {
    // Screen không được gọi thẳng repository; mọi thứ đi qua intent.
    files: ['src/features/**/*Screen.tsx', 'src/features/**/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/data/*'],
            message: 'Screen chỉ đọc state và bắn intent. Truy cập dữ liệu nằm trong ViewModel.' },
        ],
      }],
    },
  },
  {
    // ui/ là design system thuần: không biết nghiệp vụ, để tái dùng cho các tool sau.
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/features/*', '@/domain/*', '@/data/*'],
            message: 'ui/ dùng chung cho mọi tool trong supertool, nên không được gắn với nghiệp vụ của một tool.' },
        ],
      }],
    },
  },
]

const config = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'tools/**/*.cjs', 'prisma/migrations/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Flat config không kế thừa plugin giữa các object, nên phải khai lại ở
    // chính object dùng luật của plugin đó.
    plugins: { '@typescript-eslint': typescriptEslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Script chạy trên dòng lệnh: in ra màn hình chính là giao diện của chúng.
    files: ['prisma/**/*.ts', 'scripts/**/*.mjs', 'scripts/**/*.ts', 'tools/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  ...layerBoundaries,
]

export default config
