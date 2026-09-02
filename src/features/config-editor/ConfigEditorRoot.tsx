'use client'

import { useEffect } from 'react'

import { ConfigEditorViewModel, configEditorDeps } from './ConfigEditorViewModel'
import { ConfigEditorScreen } from './ConfigEditorScreen'
import type { ConfigEditorScreenProps } from './ConfigEditorScreen'

export interface ConfigEditorRootProps extends ConfigEditorScreenProps {
  appSlug: string
}

/**
 * Gắn ViewModel vào vòng đời màn hình rồi bắn intent khởi động.
 *
 * Tách khỏi `ConfigEditorScreen` vì hook của ViewModel chỉ dùng được bên trong
 * Provider của chính nó — cùng một component vừa dựng Provider vừa gọi hook là
 * không được. Đây cũng là chỗ duy nhất nối màn hình với phụ thuộc thật; test
 * dựng Provider riêng với repository giả.
 */
export function ConfigEditorRoot({ appSlug, ...screenProps }: ConfigEditorRootProps) {
  return (
    <ConfigEditorViewModel.Provider deps={configEditorDeps(appSlug)}>
      <LoadOnMount />
      <ConfigEditorScreen {...screenProps} />
    </ConfigEditorViewModel.Provider>
  )
}

function LoadOnMount() {
  const onIntent = ConfigEditorViewModel.useIntent()

  useEffect(() => {
    onIntent({ type: 'Load' })
  }, [onIntent])

  return null
}
