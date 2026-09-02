'use client'

import { StringTranslatorViewModel } from './StringTranslatorViewModel'
import { StringTranslatorScreen } from './StringTranslatorScreen'
import type { StringTranslatorScreenProps } from './StringTranslatorScreen'

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * Tách khỏi `StringTranslatorScreen` vì hook của ViewModel chỉ dùng được bên
 * trong Provider của chính nó — một component vừa dựng Provider vừa gọi hook là
 * không được. Không có intent khởi động: màn hình này bắt đầu từ chỗ chưa có gì,
 * và mọi thứ đều do người dùng châm ngòi.
 */
export function StringTranslatorRoot(props: StringTranslatorScreenProps) {
  return (
    <StringTranslatorViewModel.Provider>
      <StringTranslatorScreen {...props} />
    </StringTranslatorViewModel.Provider>
  )
}
