import { globalShortcut } from 'electron'
import { closeAllPlaybackWindows } from './windows'
import { persistence } from './services/persistence'

let currentAccelerator: string | null = null

/** Valid modifier keys for Electron accelerators */
const VALID_MODIFIERS = new Set([
  'CommandOrControl', 'CmdOrCtrl', 'Command', 'Cmd',
  'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta',
])

/** Keys that cannot be used alone as shortcut keys */
const MODIFIER_ONLY_KEYS = new Set([
  'Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
])

/** Reserved system shortcuts that should not be overridden */
const RESERVED_ACCELERATORS = new Set([
  'CommandOrControl+C', 'CommandOrControl+V', 'CommandOrControl+X',
  'CommandOrControl+A', 'CommandOrControl+Z', 'CommandOrControl+Q',
  'CommandOrControl+W', 'CommandOrControl+N', 'CommandOrControl+Tab',
  'Alt+F4', 'Alt+Tab',
])

/**
 * Validate an Electron accelerator string.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export function validateAccelerator(
  accelerator: string
): { valid: true } | { valid: false; reason: string } {
  if (!accelerator || !accelerator.trim()) {
    return { valid: false, reason: 'Empty shortcut' }
  }

  const parts = accelerator.split('+').map((p) => p.trim())
  if (parts.length < 2) {
    return { valid: false, reason: 'Shortcut must include at least one modifier and a key' }
  }

  const modifiers = parts.slice(0, -1)
  const key = parts[parts.length - 1]

  if (!key || MODIFIER_ONLY_KEYS.has(key)) {
    return { valid: false, reason: 'Shortcut must end with a non-modifier key' }
  }

  for (const mod of modifiers) {
    if (!VALID_MODIFIERS.has(mod)) {
      return { valid: false, reason: `Invalid modifier: ${mod}` }
    }
  }

  // Normalize for reserved check
  const normalized = accelerator.replace(/Cmd|Command/g, 'CommandOrControl').replace(/Ctrl|Control/g, 'CommandOrControl')
  if (RESERVED_ACCELERATORS.has(normalized)) {
    return { valid: false, reason: 'This shortcut is reserved by the system' }
  }

  return { valid: true }
}

/**
 * Try to register an accelerator to check if it's available.
 * Returns true if available, false if taken. Unregisters after check.
 */
export function isAcceleratorAvailable(accelerator: string): boolean {
  // Skip the check if it's our own current shortcut
  if (accelerator === currentAccelerator) return true

  try {
    const registered = globalShortcut.register(accelerator, () => {})
    if (registered) {
      globalShortcut.unregister(accelerator)
      return true
    }
    return false
  } catch {
    return false
  }
}

export function registerExitShortcut(): void {
  unregisterExitShortcut()
  const config = persistence.getConfig()
  const accelerator = config.exitShortcutAccelerator || `Ctrl+Alt+Shift+${config.exitShortcutKey}`
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

export function updateExitShortcut(accelerator: string): void {
  // Extract the last key for backward compat
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1] || 'Q'

  persistence.saveConfig({
    exitShortcutKey: key,
    exitShortcutAccelerator: accelerator,
  })

  // Re-register only if shortcut is currently active (playback is running)
  if (currentAccelerator) {
    registerExitShortcut()
  }
}

/** Legacy compat */
export function updateExitShortcutKey(key: string): void {
  updateExitShortcut(`Ctrl+Alt+Shift+${key}`)
}
