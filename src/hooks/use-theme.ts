import { useCallback, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store/app-store'
import type { Theme } from '../../electron/shared/ipc-types'

// ─── Module-level state ─────────────────────────────────────────────────────

let currentTheme: Theme = 'dark'
let listeners: Array<() => void> = []
let version = 0

function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function getSnapshot() {
  return version
}

function notifyListeners() {
  version += 1
  for (const cb of listeners) cb()
}

// ─── Apply theme to DOM ─────────────────────────────────────────────────────

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return theme
}

function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  const root = document.documentElement
  if (effective === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// Listen for system theme changes when theme is 'system'
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (currentTheme === 'system') {
      applyTheme('system')
      notifyListeners()
    }
  })
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Initialize theme from config (call once at app boot) */
export function initTheme(theme: Theme): void {
  currentTheme = theme
  applyTheme(theme)
  notifyListeners()
}

/**
 * Hook that provides reactive theme value and theme setter.
 * Components using this hook re-render when theme changes.
 */
export function useTheme() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const theme = currentTheme

  const changeTheme = useCallback(async (newTheme: Theme) => {
    currentTheme = newTheme
    applyTheme(newTheme)
    // Persist to config
    try {
      const updated = await window.electronAPI.saveConfig({ theme: newTheme })
      useAppStore.getState().setConfig(updated)
    } catch {
      // Non-fatal
    }
    notifyListeners()
  }, [])

  return { theme, changeTheme }
}
