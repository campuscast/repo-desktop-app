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

export async function waitForDisplayStability(
  settleMs = 1200,
  timeoutMs = 6000
): Promise<DisplayInfo[]> {
  return new Promise((resolve) => {
    let settled = false
    let settleTimer: NodeJS.Timeout | null = null
    let timeoutTimer: NodeJS.Timeout | null = null

    const finish = (): void => {
      if (settled) return
      settled = true
      if (settleTimer) clearTimeout(settleTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      screen.removeListener('display-added', onDisplayChanged)
      screen.removeListener('display-removed', onDisplayChanged)
      screen.removeListener('display-metrics-changed', onDisplayChanged)
      resolve(getDisplays())
    }

    const scheduleSettle = (): void => {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(finish, settleMs)
    }

    const onDisplayChanged = (): void => {
      scheduleSettle()
    }

    screen.on('display-added', onDisplayChanged)
    screen.on('display-removed', onDisplayChanged)
    screen.on('display-metrics-changed', onDisplayChanged)

    timeoutTimer = setTimeout(finish, timeoutMs)
    scheduleSettle()
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
