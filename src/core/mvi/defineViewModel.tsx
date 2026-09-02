'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from 'zustand'

import { createViewModel } from './createViewModel'
import type { ViewModelDefinition, ViewModelInstance } from './types'

const identity = <S,>(state: S): S => state

export interface ViewModelBinding<S, I, E, D> {
  readonly definition: ViewModelDefinition<S, I, E, D>
  /** Gắn ViewModel vào vòng đời của cây con. Một màn hình, một Provider. */
  readonly Provider: (props: { deps?: D; children: ReactNode }) => ReactNode
  /** Đọc state, có thể chọn lát cắt để hạn chế render lại. */
  readonly useState: {
    (): S
    <R>(selector: (state: S) => R): R
  }
  /** Lấy hàm bắn intent. Đây là đường duy nhất từ màn hình vào ViewModel. */
  readonly useIntent: () => (intent: I) => void
  /**
   * Nghe Effect. Tương đương `collect` (KHÔNG phải `collectLatest`): mọi effect
   * đều được xử lý, không cái nào bị bỏ qua vì cái sau tới sớm hơn.
   */
  readonly useEffects: (handler: (effect: E) => void) => void
}

/**
 * Biến một định nghĩa ViewModel thành bộ Provider + hooks dùng trong React.
 *
 *     export const ConfigEditorViewModel = defineViewModel({
 *       name: 'ConfigEditor',
 *       createDependencies: () => clientContainer.configEditorDeps(),
 *       initialState: () => initialConfigEditorState,
 *       handleIntent: async (intent, ctx, deps) => { ... },
 *     })
 *
 * Rồi ở màn hình:
 *
 *     <ConfigEditorViewModel.Provider>
 *       <ConfigEditorScreen />
 *     </ConfigEditorViewModel.Provider>
 */
export function defineViewModel<S, I, E, D = void>(
  definition: ViewModelDefinition<S, I, E, D> & {
    /** Nguồn phụ thuộc mặc định. Provider có thể ghi đè khi viết test. */
    createDependencies?: () => D
  },
): ViewModelBinding<S, I, E, D> {
  const Context = createContext<ViewModelInstance<S, I, E> | null>(null)
  Context.displayName = `${definition.name}ViewModel`

  const resolveDeps = (override: D | undefined): D => {
    if (override !== undefined) return override
    if (definition.createDependencies) return definition.createDependencies()
    return undefined as D
  }

  function Provider({ deps, children }: { deps?: D; children: ReactNode }) {
    const [instance, setInstance] = useState(() => createViewModel(definition, resolveDeps(deps)))

    useEffect(() => {
      // StrictMode ở môi trường dev gắn — gỡ — gắn lại. Lần gỡ đầu đã dispose
      // instance này, nên phải dựng lại cái mới thay vì dùng tiếp cái đã chết.
      if (instance.isDisposed) {
        setInstance(createViewModel(definition, resolveDeps(deps)))
        return
      }
      return () => instance.dispose()
      // `deps` cố tình không nằm trong danh sách: ViewModel gắn với vòng đời
      // màn hình, không dựng lại mỗi khi tham chiếu phụ thuộc đổi.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instance])

    return <Context.Provider value={instance}>{children}</Context.Provider>
  }
  Provider.displayName = `${definition.name}ViewModel.Provider`

  const useViewModel = (): ViewModelInstance<S, I, E> => {
    const instance = useContext(Context)
    if (instance === null) {
      throw new Error(
        `${definition.name}ViewModel: thiếu <${definition.name}ViewModel.Provider> ở phía trên cây component.`,
      )
    }
    return instance
  }

  function useViewModelState<R>(selector: (state: S) => R = identity as unknown as (state: S) => R): R {
    return useStore(useViewModel().store, selector)
  }

  const useIntent = (): ((intent: I) => void) => {
    const instance = useViewModel()
    return useCallback((intent: I) => instance.onIntent(intent), [instance])
  }

  const useEffects = (handler: (effect: E) => void): void => {
    const instance = useViewModel()
    const handlerRef = useRef(handler)

    // Cập nhật trước effect gắn kênh bên dưới (effect chạy theo thứ tự khai báo),
    // nên lần xả hàng đợi đầu tiên đã dùng handler mới nhất.
    useEffect(() => {
      handlerRef.current = handler
    })

    useEffect(() => instance.connectEffects((effect) => handlerRef.current(effect)), [instance])
  }

  return {
    definition,
    Provider,
    useState: useViewModelState as ViewModelBinding<S, I, E, D>['useState'],
    useIntent,
    useEffects,
  }
}
