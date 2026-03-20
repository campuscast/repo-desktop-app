import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { AutoLaunchSettings } from '../../shared/ipc-types'
import {
  LINUX_AUTOSTART_FILENAME,
  buildLinuxDesktopEntry,
  getLinuxAutostartDir as resolveLinuxAutostartDir,
  isLinuxAutostartDesktopEntry,
} from './auto-launch-linux'

const AUTO_LAUNCH_ARG = '--autostart'

function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
}

function readLoginItemSettings(): Partial<Electron.LoginItemSettings> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return {}
  }

  try {
    return app.getLoginItemSettings({ args: [AUTO_LAUNCH_ARG] })
  } catch {
    return app.getLoginItemSettings()
  }
}

export function getAutoLaunchSettings(): AutoLaunchSettings {
  if (process.platform === 'linux') {
    return {
      enabled: isLinuxAutoLaunchEnabled(),
      supported: true,
    }
  }

  if (!isSupportedPlatform()) {
    return { enabled: false, supported: false }
  }

  const settings = readLoginItemSettings()
  return {
    enabled: settings.openAtLogin === true,
    supported: true,
  }
}

export function setAutoLaunchEnabled(enabled: boolean): AutoLaunchSettings {
  if (process.platform === 'linux') {
    try {
      configureLinuxAutoLaunch(enabled)
    } catch (err) {
      console.error('[autostart] Linux auto-launch setup failed:', err)
      return { enabled: false, supported: true }
    }
    return getAutoLaunchSettings()
  }

  if (!isSupportedPlatform()) {
    return { enabled: false, supported: false }
  }

  const options: Parameters<typeof app.setLoginItemSettings>[0] = {
    openAtLogin: enabled,
    args: [AUTO_LAUNCH_ARG],
  }

  if (process.platform === 'darwin') {
    options.openAsHidden = true
  }

  if (process.platform === 'win32') {
    options.path = process.execPath
  }

  app.setLoginItemSettings(options)
  return getAutoLaunchSettings()
}

export function isLaunchedViaAutoLaunch(): boolean {
  if (process.argv.includes(AUTO_LAUNCH_ARG)) {
    return true
  }

  if (process.platform === 'linux' && process.env.DESKTOP_AUTOSTART_ID?.trim()) {
    return true
  }

  if (!isSupportedPlatform()) {
    return false
  }

  const settings = readLoginItemSettings()
  return settings.wasOpenedAtLogin === true
}

function getLinuxAutostartDir(): string {
  return resolveLinuxAutostartDir(app.getPath('home'), process.env.XDG_CONFIG_HOME)
}

function getLinuxAutostartFilePath(): string {
  return join(getLinuxAutostartDir(), LINUX_AUTOSTART_FILENAME)
}

function getLinuxExecPath(): string {
  const appImagePath = process.env.APPIMAGE?.trim()
  if (appImagePath && existsSync(appImagePath)) {
    return appImagePath
  }
  return process.execPath
}

function isLinuxAutoLaunchEnabled(): boolean {
  const filePath = getLinuxAutostartFilePath()
  if (!existsSync(filePath)) return false

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return isLinuxAutostartDesktopEntry(raw, AUTO_LAUNCH_ARG)
  } catch (err) {
    console.warn('[autostart] Failed to read Linux autostart file:', err)
    return false
  }
}

function configureLinuxAutoLaunch(enabled: boolean): void {
  const autostartPath = getLinuxAutostartFilePath()

  if (!enabled) {
    if (existsSync(autostartPath)) {
      rmSync(autostartPath)
      console.info(`[autostart] Linux auto-launch removed: ${autostartPath}`)
    }
    return
  }

  const execPath = getLinuxExecPath()
  const content = buildLinuxDesktopEntry(execPath, AUTO_LAUNCH_ARG)
  const autostartDir = getLinuxAutostartDir()

  mkdirSync(autostartDir, { recursive: true })
  writeFileSync(autostartPath, content, { encoding: 'utf-8', mode: 0o644 })
  console.info(`[autostart] Linux auto-launch written: ${autostartPath}`)
  console.info(`[autostart] Linux auto-launch exec path: ${execPath}`)
  console.info(`[autostart] Linux auto-launch content:\n${content}`)
}
