import { app, BrowserWindow, screen, shell, powerSaveBlocker } from 'electron'
import { join } from 'path'
import type { DisplayInfo } from '../shared/ipc-types'

const isDev = process.env.NODE_ENV !== 'production'

let controlWindow: BrowserWindow | null = null
const playbackWindows = new Map<string, BrowserWindow>()
let powerSaveBlockerId: number | null = null

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.mjs')
}

function getRendererPath(): string {
  // In production, renderer is in extraResources/renderer/
  return join(process.resourcesPath, 'renderer', 'index.html')
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

  // Graceful show
  controlWindow.on('ready-to-show', () => {
    controlWindow?.show()
  })

  // Open external links in system browser
  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    controlWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=control`)
  } else {
    controlWindow.loadFile(getRendererPath(), {
      query: { mode: 'control' },
    })
  }

  controlWindow.on('closed', () => {
    controlWindow = null
  })

  return controlWindow
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export function createPlaybackWindow(display: DisplayInfo): BrowserWindow {
  // Close existing window for this display
  closePlaybackWindow(display.id)

  const win = new BrowserWindow({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    fullscreen: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
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
    win.show()
    win.setFullScreen(true)
  })

  // Prevent closing with keyboard shortcuts during playback
  win.on('close', (e) => {
    // Allow close if triggered programmatically
    if (!win.isDestroyed()) {
      e.preventDefault()
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}?mode=playback&displayId=${display.id}`
    )
  } else {
    win.loadFile(getRendererPath(), {
      query: { mode: 'playback', displayId: display.id },
    })
  }

  playbackWindows.set(display.id, win)

  // Prevent OS sleep during playback
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }

  // Register exit shortcut when first playback window opens
  if (playbackWindows.size === 1) {
    try {
      const { registerExitShortcut } = require('./shortcut-manager')
      registerExitShortcut()
    } catch { /* shortcut-manager may not be loaded yet */ }
  }

  win.on('closed', () => {
    playbackWindows.delete(display.id)
  })

  return win
}

export function closePlaybackWindow(displayId: string): void {
  const win = playbackWindows.get(displayId)
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close')
    win.close()
  }
  playbackWindows.delete(displayId)

  // Stop power save blocker when all playback windows are closed
  if (playbackWindows.size === 0 && powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null

    // Unregister exit shortcut
    try {
      const { unregisterExitShortcut } = require('./shortcut-manager')
      unregisterExitShortcut()
    } catch { /* shortcut-manager may not be loaded yet */ }
  }
}

export function closeAllPlaybackWindows(): void {
  for (const [id] of playbackWindows) {
    closePlaybackWindow(id)
  }
}

export function openPlaybackWindows(displays: DisplayInfo[]): void {
  for (const display of displays) {
    createPlaybackWindow(display)
  }
}

export function getPlaybackWindows(): Map<string, BrowserWindow> {
  return playbackWindows
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
    isPrimary: display.id === primaryDisplay.id,
    scaleFactor: display.scaleFactor,
    internal: display.internal ?? false,
  }
}
