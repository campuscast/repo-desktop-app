import { screen, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { electronDisplayToInfo } from './windows'
import type { DisplayInfo } from '../shared/ipc-types'

let cachedDisplays: DisplayInfo[] = []

export function getDisplays(): DisplayInfo[] {
  const electronDisplays = screen.getAllDisplays()
  cachedDisplays = electronDisplays.map((d, i) => electronDisplayToInfo(d, i))
  return cachedDisplays
}

export function getCachedDisplays(): DisplayInfo[] {
  return cachedDisplays
}

export function findDisplay(displayId: string): DisplayInfo | undefined {
  return cachedDisplays.find((d) => d.id === displayId)
}

export function initDisplayManager(controlWindow: BrowserWindow): void {
  // Initial scan
  getDisplays()

  // Watch for display changes
  screen.on('display-added', () => {
    const displays = getDisplays()
    notifyDisplayChange(controlWindow, displays)
  })

  screen.on('display-removed', () => {
    const displays = getDisplays()
    notifyDisplayChange(controlWindow, displays)
  })

  screen.on('display-metrics-changed', () => {
    const displays = getDisplays()
    notifyDisplayChange(controlWindow, displays)
  })
}

function notifyDisplayChange(
  controlWindow: BrowserWindow,
  displays: DisplayInfo[]
): void {
  if (!controlWindow.isDestroyed()) {
    controlWindow.webContents.send(IPC.DISPLAYS_CHANGED, displays)
  }
}
