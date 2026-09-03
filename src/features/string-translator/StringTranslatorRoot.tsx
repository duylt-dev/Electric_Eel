'use client'

import type { TranslationSettings } from '@/domain/translation/entities/TranslationSettings'
import { StringTranslatorViewModel, stringTranslatorDeps } from './StringTranslatorViewModel'
import { StringTranslatorScreen } from './StringTranslatorScreen'

/**
 * Gắn ViewModel vào vòng đời màn hình.
 *
 * Tách khỏi `StringTranslatorScreen` vì hook của ViewModel chỉ dùng được bên
 * trong Provider của chính nó — một component vừa dựng Provider vừa gọi hook là
 * không được.
 *
 * Cấu hình mô hình đi vào qua `deps` chứ không qua props của màn hình: nó là
 * trạng thái BAN ĐẦU, và từ lúc màn hình sống thì nguồn sự thật là state của
 * ViewModel. Truyền xuống làm props thì màn hình có hai nguồn nói về cùng một
 * thứ, và cái chụp lúc dựng trang sẽ cũ đi ngay khi người dùng gắn khoá mới.
 */
export interface StringTranslatorRootProps {
  settings: TranslationSettings
}

export function StringTranslatorRoot({ settings }: StringTranslatorRootProps) {
  return (
    <StringTranslatorViewModel.Provider deps={stringTranslatorDeps(settings)}>
      <StringTranslatorScreen />
    </StringTranslatorViewModel.Provider>
  )
}
