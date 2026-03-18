import { app } from 'electron'
import type { AutoLaunchSettings } from '../../shared/ipc-types'

const AUTO_LAUNCH_ARG = '--autostart'

function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}

function readLoginItemSettings(): Partial<Electron.LoginItemSettings> {
  if (!isSupportedPlatform()) {
    return {}
  }

  try {
    return app.getLoginItemSettings({ args: [AUTO_LAUNCH_ARG] })
  } catch {
    return app.getLoginItemSettings()
  }
}

export function getAutoLaunchSettings(): AutoLaunchSettings {
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

  if (!isSupportedPlatform()) {
    return false
  }

  const settings = readLoginItemSettings()
  return settings.wasOpenedAtLogin === true
}
