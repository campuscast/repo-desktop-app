import { useCallback, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store/app-store'
import { t as rawT, setLocale, getLocale } from '@/lib/i18n'
import type { Locale } from '../../electron/shared/ipc-types'

// Simple subscription mechanism so useSyncExternalStore re-renders on locale change
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

/**
 * Hook that provides reactive translation function and locale setter.
 * Components using `t()` from this hook re-render when locale changes.
 */
export function useLocale() {
  // Subscribe to locale changes
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const locale = getLocale()

  const changeLocale = useCallback(async (newLocale: Locale) => {
    setLocale(newLocale)
    // Persist to config
    try {
      const updated = await window.electronAPI.saveConfig({ locale: newLocale })
      useAppStore.getState().setConfig(updated)
    } catch {
      // Non-fatal
    }
    notifyListeners()
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => rawT(key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )

  return { t, locale, changeLocale }
}

/** Initialize locale from config (call once at app boot) */
export function initLocale(locale: Locale): void {
  setLocale(locale)
  notifyListeners()
}
