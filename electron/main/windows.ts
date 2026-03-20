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

let controlWindow: BrowserWindow | null = null
const playbackWindows = new Map<string, BrowserWindow>()
const playbackPresentationStates = new Map<string, PlaybackPresentationState>()
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

  // Load renderer
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    startupMark('main:control-window-load-url')
    controlWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=control`)
  } else {
    startupMark('main:control-window-load-file')
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
    registerExitShortcut()
  }

  win.on('closed', () => {
    playbackWindows.delete(display.id)
    playbackPresentationStates.delete(display.id)
  })

  return win
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
