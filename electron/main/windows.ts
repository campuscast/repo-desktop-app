import { app, BrowserWindow, screen, shell, powerSaveBlocker } from 'electron'
import { join } from 'path'
import type { DisplayInfo } from '../shared/ipc-types'
import { registerExitShortcut, unregisterExitShortcut } from './shortcut-manager'
import {
  enterPlaybackPresentationMode,
  exitPlaybackPresentationMode,
  type PlaybackPresentationState,
} from './playback-presentation'
import { startupMark } from './startup-trace'

const isDev = process.env.NODE_ENV !== 'production'
const WINDOW_RECOVERY_DELAY_MS = 1_500
const WINDOW_UNRESPONSIVE_GRACE_MS = 15_000

let controlWindow: BrowserWindow | null = null
const playbackWindows = new Map<string, BrowserWindow>()
const playbackPresentationStates = new Map<string, PlaybackPresentationState>()
let powerSaveBlockerId: number | null = null
let playbackRequested = false

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.mjs')
}

function getRendererPath(): string {
  // In production, renderer is in extraResources/renderer/
  return join(process.resourcesPath, 'renderer', 'index.html')
}

function buildRendererTarget(
  mode: 'control' | 'playback',
  displayId?: string
): { devUrl: string | null; query: Record<string, string> } {
  const query: Record<string, string> = { mode }
  if (displayId) {
    query.displayId = displayId
  }

  if (!isDev || !process.env.ELECTRON_RENDERER_URL) {
    return { devUrl: null, query }
  }

  const url = new URL(process.env.ELECTRON_RENDERER_URL)
  url.searchParams.set('mode', mode)
  if (displayId) {
    url.searchParams.set('displayId', displayId)
  } else {
    url.searchParams.delete('displayId')
  }

  return { devUrl: url.toString(), query }
}

async function loadRendererWindow(
  win: BrowserWindow,
  mode: 'control' | 'playback',
  displayId?: string
): Promise<void> {
  const target = buildRendererTarget(mode, displayId)
  if (target.devUrl) {
    await win.loadURL(target.devUrl)
    return
  }

  await win.loadFile(getRendererPath(), { query: target.query })
}

function attachWindowRecovery(
  win: BrowserWindow,
  label: string,
  recover: (reason: string) => void
): void {
  let recoveryTimer: NodeJS.Timeout | null = null
  let unresponsiveTimer: NodeJS.Timeout | null = null

  const clearRecoveryTimer = (): void => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
      recoveryTimer = null
    }
  }

  const clearUnresponsiveTimer = (): void => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer)
      unresponsiveTimer = null
    }
  }

  const scheduleRecovery = (reason: string): void => {
    if (win.isDestroyed()) return
    if (recoveryTimer) return

    console.warn(`[window-recovery] ${label}: ${reason}`)
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null
      if (win.isDestroyed()) return
      recover(reason)
    }, WINDOW_RECOVERY_DELAY_MS)
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    scheduleRecovery(`render-process-gone:${details.reason}`)
  })

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      scheduleRecovery(`did-fail-load:${errorCode}:${errorDescription}`)
    }
  )

  win.on('unresponsive', () => {
    if (win.isDestroyed()) return
    if (unresponsiveTimer) return

    console.warn(`[window-recovery] ${label}: unresponsive`)
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null
      scheduleRecovery('unresponsive')
    }, WINDOW_UNRESPONSIVE_GRACE_MS)
  })

  win.on('responsive', () => {
    clearUnresponsiveTimer()
  })

  win.on('closed', () => {
    clearRecoveryTimer()
    clearUnresponsiveTimer()
  })
}

function resolveRecoveryDisplay(display: DisplayInfo): DisplayInfo {
  const currentDisplays = screen
    .getAllDisplays()
    .map((entry, index) => electronDisplayToInfo(entry, index))

  return currentDisplays.find((item) => item.id === display.id)
    ?? currentDisplays.find(
      (item) =>
        item.x === display.x
        && item.y === display.y
        && item.width === display.width
        && item.height === display.height
    )
    ?? currentDisplays.find((item) => item.isPrimary)
    ?? currentDisplays[0]
    ?? display
}

export function createControlWindow(): BrowserWindow {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.focus()
    return controlWindow
  }

  controlWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'CampusCast Player',
    backgroundColor: '#0f0f13',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  let shown = false
  const showControlWindow = (reason: string): void => {
    if (shown) return
    if (!controlWindow || controlWindow.isDestroyed()) return
    shown = true
    startupMark('main:control-window-show', { reason })
    controlWindow.show()
  }

  controlWindow.on('ready-to-show', () => {
    startupMark('main:control-window-ready-to-show')
    showControlWindow('ready-to-show')
  })
  controlWindow.webContents.on('did-finish-load', () => {
    startupMark('main:control-window-did-finish-load')
    showControlWindow('did-finish-load')
  })
  setTimeout(() => {
    showControlWindow('show-timeout')
  }, 1200)

  // Open external links in system browser
  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  attachWindowRecovery(controlWindow, 'control-window', (reason) => {
    console.warn(`[window-recovery] control-window reload: ${reason}`)
    void reloadControlWindow(reason).catch((error) => {
      console.warn('[window-recovery] control-window recovery failed:', error)
    })
  })

  startupMark('main:control-window-load')
  void loadRendererWindow(controlWindow, 'control').catch((error) => {
    console.warn('[window-recovery] control-window initial load failed:', error)
  })

  controlWindow.on('closed', () => {
    controlWindow = null
  })

  return controlWindow
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export async function reloadControlWindow(reason = 'manual'): Promise<void> {
  if (!controlWindow || controlWindow.isDestroyed()) {
    createControlWindow()
    return
  }

  console.info(`[window-recovery] control-window reload requested: ${reason}`)
  await loadRendererWindow(controlWindow, 'control')
}

export function createPlaybackWindow(display: DisplayInfo): BrowserWindow {
  // Close existing window for this display
  closePlaybackWindow(display.id)

  const win = new BrowserWindow({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    fullscreen: false,
    fullscreenable: true,
    simpleFullscreen: process.platform === 'darwin',
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => {
    // Ensure we stay on the selected display before entering presentation mode.
    win.setBounds({
      x: display.x,
      y: display.y,
      width: display.width,
      height: display.height,
    })
    const previousState = enterPlaybackPresentationMode(win)
    playbackPresentationStates.set(display.id, previousState)
    win.show()
    win.focus()
  })

  // Prevent closing with keyboard shortcuts during playback
  win.on('close', (e) => {
    // Allow close if triggered programmatically
    if (!win.isDestroyed()) {
      e.preventDefault()
    }
  })

  attachWindowRecovery(win, `playback-window:${display.id}`, (reason) => {
    console.warn(
      `[window-recovery] reopening playback window ${display.id}: ${reason}`
    )
    recreatePlaybackWindow(display, reason)
  })

  void loadRendererWindow(win, 'playback', display.id).catch((error) => {
    console.warn(
      `[window-recovery] playback window ${display.id} initial load failed:`,
      error
    )
  })

  playbackWindows.set(display.id, win)

  // Prevent OS sleep during playback
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }

  // Register exit shortcut when first playback window opens
  if (playbackWindows.size === 1) {
    registerExitShortcut()
  }

  win.on('closed', () => {
    playbackWindows.delete(display.id)
    playbackPresentationStates.delete(display.id)
  })

  return win
}

function recreatePlaybackWindow(
  display: DisplayInfo,
  reason: string
): void {
  closePlaybackWindow(display.id)
  if (!playbackRequested) {
    console.info(
      `[window-recovery] playback intent cleared; skip recreate for ${display.id} (${reason})`
    )
    return
  }

  createPlaybackWindow(resolveRecoveryDisplay(display))
}

export function closePlaybackWindow(displayId: string): void {
  const win = playbackWindows.get(displayId)
  const previousState = playbackPresentationStates.get(displayId)
  if (win && !win.isDestroyed()) {
    if (previousState) {
      win.hide()
      exitPlaybackPresentationMode(win, previousState)
    }
    win.removeAllListeners('close')
    win.close()
  }
  playbackWindows.delete(displayId)
  playbackPresentationStates.delete(displayId)

  // Stop power save blocker when all playback windows are closed
  if (playbackWindows.size === 0 && powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null

    // Unregister exit shortcut
    unregisterExitShortcut()
  }
}

export function closeAllPlaybackWindows(): void {
  playbackRequested = false
  for (const [id] of playbackWindows) {
    closePlaybackWindow(id)
  }
}

export function openPlaybackWindows(displays: DisplayInfo[]): void {
  playbackRequested = displays.length > 0
  for (const display of displays) {
    createPlaybackWindow(display)
  }
}

export function getPlaybackWindows(): Map<string, BrowserWindow> {
  return playbackWindows
}

export function isPlaybackRequested(): boolean {
  return playbackRequested
}

export function preservePlaybackIntent(): void {
  playbackRequested = true
}

/** Send a message to all playback windows */
export function broadcastToPlayback(channel: string, ...args: unknown[]): void {
  for (const [, win] of playbackWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

/** Map Electron Display to our DisplayInfo */
export function electronDisplayToInfo(
  display: Electron.Display,
  index: number
): DisplayInfo {
  const primaryDisplay = screen.getPrimaryDisplay()
  return {
    id: String(display.id),
    label: `Display ${index + 1}${display.id === primaryDisplay.id ? ' (Primary)' : ''}`,
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    workAreaX: display.workArea.x,
    workAreaY: display.workArea.y,
    workAreaWidth: display.workArea.width,
    workAreaHeight: display.workArea.height,
    isPrimary: display.id === primaryDisplay.id,
    scaleFactor: display.scaleFactor,
    internal: display.internal ?? false,
    rotation: display.rotation,
  }
}
