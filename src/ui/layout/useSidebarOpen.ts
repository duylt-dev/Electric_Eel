'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'shell.sidebarOpen'
const DEFAULT_OPEN = true

function readStored(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? DEFAULT_OPEN : raw === '1'
  } catch {
    return DEFAULT_OPEN
  }
}

/** Người nghe trong cùng tab — sự kiện `storage` của trình duyệt chỉ bắn sang tab KHÁC. */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * Cột công cụ đang mở hay đã thu. Sở thích thuần giao diện, nhớ qua
 * `localStorage` để lần mở sau vẫn như người dùng đã để.
 *
 * `useSyncExternalStore` chứ không phải `useState(() => localStorage…)`, cùng
 * lý do với `useLogFontSize`: HTML từ server không biết localStorage, nên
 * `getServerSnapshot` trả mặc định (mở) cho cả server lẫn lượt hydrate, rồi
 * React vẽ lại theo giá trị đã lưu — không lệch hydration ở khung. Đọc/ghi
 * bọc `try` vì `localStorage` có thể ném ở chế độ riêng tư.
 */
export function useSidebarOpen(): [boolean, () => void] {
  const open = useSyncExternalStore(subscribe, readStored, () => DEFAULT_OPEN)

  const toggle = (): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '0' : '1')
    } catch {
      // Không nhớ được thì thôi — vẫn báo cho người nghe để cột đổi trong phiên này.
    }
    listeners.forEach((listener) => listener())
  }

  return [open, toggle]
}
