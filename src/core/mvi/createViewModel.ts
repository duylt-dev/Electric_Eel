import { createStore } from 'zustand/vanilla'

import { isAbortError, toAppError } from '../result/AppError'
import { EffectChannel } from './EffectChannel'
import type { IntentContext, ViewModelDefinition, ViewModelInstance } from './types'

/**
 * Tạo một ViewModel từ định nghĩa của nó. Không dính React — nhờ vậy viết test
 * cho ViewModel chỉ cần gọi `onIntent` rồi đọc `store.getState()`, không phải
 * render gì cả.
 *
 * Ba bảo đảm mà lớp này giữ hộ mọi ViewModel, để từng màn hình không phải tự lo:
 *
 *  1. Mọi công việc bất đồng bộ đều được bọc bắt lỗi. Ngoại lệ không bao giờ
 *     thoát ra ngoài thành unhandled rejection.
 *  2. Huỷ không phải lỗi. AbortError bị nuốt lặng lẽ, không hiện lên UI.
 *  3. Job con luôn là con của job gốc. `dispose()` dừng sạch mọi thứ đang chạy,
 *     nên không màn hình nào cần giữ biến job rồi tự gọi huỷ.
 */
export function createViewModel<S, I, E, D>(
  definition: ViewModelDefinition<S, I, E, D>,
  deps: D,
): ViewModelInstance<S, I, E> {
  const store = createStore<S>()(() => definition.initialState(deps))
  const effects = new EffectChannel<E>()

  const rootController = new AbortController()
  /** Job đang chạy theo khoá, để intent mới cùng khoá huỷ được cái cũ. */
  const running = new Map<string, AbortController>()

  let disposed = false

  const makeContext = (signal: AbortSignal): IntentContext<S, E> => ({
    signal,
    getState: () => store.getState(),
    setState: (reducer) => {
      // Sau khi dispose, mọi cập nhật đều vô nghĩa: màn hình đã rời khỏi cây.
      // Nuốt ở đây thay vì để React cảnh báo "update on unmounted component".
      if (disposed) return
      store.setState(reducer(store.getState()), true)
    },
    emit: (effect) => {
      if (disposed) return
      effects.emit(effect)
    },
  })

  const run = (
    intent: I | null,
    body: (ctx: IntentContext<S, E>) => void | Promise<void>,
  ): void => {
    if (disposed) return

    const key = intent !== null ? definition.intentKey?.(intent) : undefined
    const own = new AbortController()

    if (key !== undefined) {
      running.get(key)?.abort(new DOMException(`Thay bằng intent mới cùng khoá "${key}"`, 'AbortError'))
      running.set(key, own)
    }

    // Job con là con của job gốc: dispose ViewModel thì signal này cũng tắt.
    const signal = AbortSignal.any([rootController.signal, own.signal])
    const ctx = makeContext(signal)

    const finish = () => {
      if (key !== undefined && running.get(key) === own) running.delete(key)
    }

    let outcome: void | Promise<void>
    try {
      outcome = body(ctx)
    } catch (thrown) {
      finish()
      reportFailure(thrown, intent, ctx, signal)
      return
    }

    if (outcome instanceof Promise) {
      outcome.then(finish, (thrown: unknown) => {
        finish()
        reportFailure(thrown, intent, ctx, signal)
      })
    } else {
      finish()
    }
  }

  const reportFailure = (
    thrown: unknown,
    intent: I | null,
    ctx: IntentContext<S, E>,
    signal: AbortSignal,
  ): void => {
    // Huỷ là kết quả bình thường của điều hướng hoặc gõ phím liên tiếp.
    if (signal.aborted || isAbortError(thrown)) return

    const error = toAppError(thrown)
    if (error.kind === 'cancelled') return

    if (definition.onError && intent !== null) {
      definition.onError(error, intent, ctx, deps)
      return
    }
    console.error(`[${definition.name}] ${error.message}`, error.detail ?? error.cause ?? '')
  }

  const instance: ViewModelInstance<S, I, E> = {
    store,
    name: definition.name,
    get isDisposed() {
      return disposed
    },
    onIntent(intent: I) {
      run(intent, (ctx) => definition.handleIntent(intent, ctx, deps))
    },
    connectEffects(consumer) {
      return effects.connect(consumer)
    },
    dispose() {
      if (disposed) return
      disposed = true
      rootController.abort(new DOMException('ViewModel đã bị huỷ', 'AbortError'))
      running.clear()
      effects.close()
    },
  }

  if (definition.onStart) {
    const onStart = definition.onStart
    run(null, (ctx) => onStart(ctx, deps))
  }

  return instance
}
