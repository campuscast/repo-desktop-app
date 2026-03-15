import { globalShortcut } from 'electron'
import { closeAllPlaybackWindows } from './windows'
import { persistence } from './services/persistence'

let currentAccelerator: string | null = null

function buildAccelerator(key: string): string {
  return `Ctrl+Alt+Shift+${key}`
}

export function registerExitShortcut(): void {
  unregisterExitShortcut()
  const config = persistence.getConfig()
  const accelerator = buildAccelerator(config.exitShortcutKey)
  try {
    globalShortcut.register(accelerator, () => {
      closeAllPlaybackWindows()
    })
    currentAccelerator = accelerator
  } catch (err) {
    console.warn('[shortcut] Failed to register:', err)
  }
}

export function unregisterExitShortcut(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch { /* ignore */ }
    currentAccelerator = null
  }
}

export function updateExitShortcutKey(key: string): void {
  persistence.saveConfig({ exitShortcutKey: key })
  // Re-register only if shortcut is currently active (playback is running)
  if (currentAccelerator) {
    registerExitShortcut()
  }
}
