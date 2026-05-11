import { app, BrowserWindow, Menu, globalShortcut, ipcMain, powerMonitor } from 'electron'
import {
  closeAllPlaybackWindows,
  createControlWindow,
  isPlaybackRequested,
  openPlaybackWindows,
  preservePlaybackIntent,
  reloadControlWindow,
} from './windows'
import {
  initDisplayManager,
  getDisplays,
  waitForDisplayStability,
} from './display-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { persistence } from './services/persistence'
import { heartbeatService } from './services/heartbeat'
import { mqttService } from './services/mqtt-client'
import { backendClient } from './services/backend-client'
import { runtimeScheduleSyncService } from './services/runtime-schedule-sync'
import {
  getAutoLaunchSettings,
  isLaunchedViaAutoLaunch,
} from './services/auto-launch'
import type { AppConfig, DisplayInfo } from '../shared/ipc-types'
import { IPC } from '../shared/ipc-channels'
import {
  deriveDisplayBindings,
  resolveDisplaysForPlayback,
} from './display-bindings'
import { startupMark } from './startup-trace'
import { withErrorTimestamp } from '../shared/error-log'
import { initRuntimeLogging } from './services/runtime-log'
import { hasMeaningfulDisplayTopologyChange } from './display-topology'

const STARTUP_DEVICE_REVALIDATE_TIMEOUT_MS = 2500
const PLAYBACK_RECOVERY_DELAY_MS = 1_500

startupMark('main:module-evaluated')
initRuntimeLogging('campuscast-player-main.log')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
startupMark('main:single-instance-lock', { gotLock })
if (!gotLock) {
  app.quit()
}

let playbackRecoveryTimer: NodeJS.Timeout | null = null
let playbackRecoveryInFlight = false
let pendingPlaybackRecoveryReason: string | null = null
let lastKnownDisplayTopology: DisplayInfo[] = []

function restorePlaybackUsingSavedDisplays(
  config: AppConfig,
  reason: string,
  displays = getDisplays()
): void {
  const resolved = resolveDisplaysForPlayback(config, displays)
  for (const line of resolved.diagnostics) {
    console.info(line)
  }
  if (resolved.usedFallback) {
    console.warn(`[display-restore] Playback recovery used fallback selection (${reason})`)
  }
  if (!resolved.usedFallback && resolved.selectedDisplays.length > 0) {
    const resolvedIds = resolved.selectedDisplays.map((display) => display.id)
    if (!sameIdOrder(config.selectedDisplayIds, resolvedIds)) {
      const bindings = deriveDisplayBindings(resolvedIds, displays)
      persistence.saveConfig({
        selectedDisplayIds: resolvedIds,
        selectedDisplayBindings: bindings,
      })
      console.info(
        `[display-restore] Persisted remapped display ids after ${reason}: ${resolvedIds.join(', ')}`
      )
    }
  }
  if (resolved.selectedDisplays.length > 0) {
    openPlaybackWindows(resolved.selectedDisplays)
  } else {
    console.warn(`[display-restore] No displays resolved for playback recovery (${reason})`)
  }
}

function sameIdOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

async function runPlaybackRecovery(reason: string): Promise<void> {
  const config = persistence.getConfig()
  if (
    !isPlaybackRequested()
    || config.activationState !== 'activated'
    || config.selectedDisplayIds.length === 0
  ) {
    return
  }

  if (playbackRecoveryInFlight) {
    pendingPlaybackRecoveryReason = reason
    return
  }

  playbackRecoveryInFlight = true
  try {
    console.info(`[display-restore] Starting playback recovery (${reason})`)
    closeAllPlaybackWindows()
    preservePlaybackIntent()
    const displays = await waitForDisplayStability()
    if (!isPlaybackRequested()) {
      console.info(
        `[display-restore] Playback recovery aborted because intent was cleared (${reason})`
      )
      return
    }
    restorePlaybackUsingSavedDisplays(persistence.getConfig(), reason, displays)
  } catch (error) {
    console.warn(`[display-restore] Playback recovery failed (${reason}):`, error)
  } finally {
    playbackRecoveryInFlight = false
    if (pendingPlaybackRecoveryReason) {
      const nextReason = pendingPlaybackRecoveryReason
      pendingPlaybackRecoveryReason = null
      schedulePlaybackRecovery(nextReason)
    }
  }
}

function schedulePlaybackRecovery(reason: string): void {
  const config = persistence.getConfig()
  if (
    !isPlaybackRequested()
    || config.activationState !== 'activated'
    || config.selectedDisplayIds.length === 0
  ) {
    return
  }

  pendingPlaybackRecoveryReason = reason
  if (playbackRecoveryTimer) {
    clearTimeout(playbackRecoveryTimer)
  }

  playbackRecoveryTimer = setTimeout(() => {
    playbackRecoveryTimer = null
    const nextReason = pendingPlaybackRecoveryReason ?? reason
    pendingPlaybackRecoveryReason = null
    void runPlaybackRecovery(nextReason)
  }, PLAYBACK_RECOVERY_DELAY_MS)
}

function handleDisplayTopologyChange(displays: DisplayInfo[]): void {
  const meaningfulTopologyChange = hasMeaningfulDisplayTopologyChange(
    lastKnownDisplayTopology,
    displays
  )
  lastKnownDisplayTopology = displays

  if (!meaningfulTopologyChange) {
    console.info('[display-restore] Ignoring display metrics change without topology change')
    return
  }

  console.info(
    `[display-restore] Display topology changed (${displays.length} display(s))`
  )
  heartbeatService.triggerNow()
  schedulePlaybackRecovery('display-topology-change')
}

async function syncScheduleOnAutoLaunch(config: AppConfig): Promise<void> {
  if (!config.deviceToken || !config.deviceId) return

  try {
    await runtimeScheduleSyncService.syncLatestRelease('autostart-bootstrap')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    persistence.saveCacheStatus({
      last_error: withErrorTimestamp(message),
    })
    console.warn('[autostart] Startup sync failed:', message)
  }
}

function resetActivationState(): void {
  persistence.saveConfig({
    deviceId: null,
    deviceName: null,
    deviceToken: null,
    mqttClientId: null,
    mqttTopicPrefix: null,
    tokenExpiresAt: null,
    activationState: 'unregistered',
    lastSyncAt: null,
    zoneId: null,
    groupId: null,
    zoneName: null,
    groupName: null,
    pendingActivationCode: null,
    pendingActivationRequestedAt: null,
  })
  mqttService.disconnect()
  heartbeatService.stop()
}

async function revalidatePersistedActivation(config: AppConfig): Promise<AppConfig> {
  if (
    config.activationState !== 'activated'
    || !config.deviceId
    || !config.deviceToken
  ) {
    return config
  }

  startupMark('main:device-revalidate:start', {
    timeoutMs: STARTUP_DEVICE_REVALIDATE_TIMEOUT_MS,
  })

  const verification = await backendClient.verifyActivatedDevice(
    config.apiBaseUrl,
    config.deviceToken,
    config.deviceId,
    STARTUP_DEVICE_REVALIDATE_TIMEOUT_MS
  )
  startupMark('main:device-revalidate:done', { status: verification.status })

  if (verification.status === 'missing') {
    resetActivationState()
    console.warn('[startup] Persisted device is missing in CMS. Activation was reset.')
  } else if (verification.status === 'exists') {
    persistence.saveConfig({
      deviceName: verification.info.device_name || null,
      zoneName: verification.info.zone_name || null,
      groupName: verification.info.group_name || null,
      zoneId: verification.info.zone_id || null,
      groupId: verification.info.group_id || null,
    })
  } else {
    console.warn(
      '[startup] Could not verify device existence in CMS; keeping current activation state.'
    )
  }

  return persistence.getConfig()
}

app.whenReady().then(async () => {
  startupMark('main:when-ready')

  // Initialize persistence (load config from disk)
  startupMark('main:persistence-init:start')
  await persistence.init()
  startupMark('main:persistence-init:end')
  const autoLaunchStatus = getAutoLaunchSettings()
  if (autoLaunchStatus.supported) {
    persistence.saveConfig({ autoLaunchEnabled: autoLaunchStatus.enabled })
  }
  startupMark('main:auto-launch-settings-loaded', autoLaunchStatus)

  // Minimal menu: keep Edit roles so clipboard shortcuts (Cmd+V etc.) work on macOS
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
  }

  // Register all IPC handlers before creating windows
  registerIpcHandlers()
  startupMark('main:ipc-handlers-registered')
  ipcMain.on(IPC.STARTUP_TRACE, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      startupMark('renderer:startup-trace', 'invalid payload')
      return
    }
    const trace = payload as {
      stage?: string
      details?: string
      timestamp?: number
    }
    const stage = trace.stage ?? 'unknown-stage'
    const details: Record<string, unknown> = {}
    if (trace.details) {
      details.details = trace.details
    }
    if (typeof trace.timestamp === 'number') {
      details.ipcLagMs = Math.max(0, Date.now() - trace.timestamp)
    }
    startupMark(stage, Object.keys(details).length > 0 ? details : undefined)
  })
  startupMark('main:startup-trace-listener-registered')

  // Create and show the control window as early as possible.
  const controlWindow = createControlWindow()
  startupMark('main:control-window-created')

  // Initialize display manager (monitors connected displays)
  initDisplayManager(controlWindow, handleDisplayTopologyChange)
  lastKnownDisplayTopology = getDisplays()
  startupMark('main:display-manager-initialized')

  // Revalidate persisted activation after first window creation so
  // network latency cannot block initial app visibility.
  const config = await revalidatePersistedActivation(persistence.getConfig())
  startupMark('main:startup-config-ready', {
    activationState: config.activationState,
  })

  // Start heartbeat and auto-connect MQTT if already activated
  if (config.activationState === 'activated' && config.deviceToken && config.deviceId) {
    mqttService.setBackendStatus('connecting', null)
    heartbeatService.start(config)
    runtimeScheduleSyncService.start()
    startupMark('main:heartbeat-started')

    // Auto-reconnect MQTT on startup
    if (config.mqttClientId && config.mqttBrokerUrl) {
      mqttService
        .connect({
          brokerUrl: config.mqttBrokerUrl,
          clientId: config.mqttClientId,
          topicPrefix: config.mqttTopicPrefix ?? '',
          deviceToken: config.deviceToken,
        })
        .catch((err) => {
          console.warn('[startup] MQTT auto-connect failed:', err)
        })
      startupMark('main:mqtt-autoconnect-requested')
    }
  }

  const launchedViaAutoLaunch = isLaunchedViaAutoLaunch()

  if (
    launchedViaAutoLaunch
    && config.activationState === 'activated'
    && config.deviceToken
    && config.deviceId
  ) {
    void syncScheduleOnAutoLaunch(config)
    console.info('[autostart] Waiting for display configuration stabilization before restore')
    startupMark('main:autostart-display-stabilization-wait')
    void waitForDisplayStability()
      .then((displays) => {
        console.info(
          `[autostart] Display configuration stabilized (${displays.length} display(s))`
        )
        startupMark('main:autostart-displays-stable', { displays: displays.length })
        restorePlaybackUsingSavedDisplays(config, 'autostart', displays)
      })
      .catch((err) => {
        console.warn('[autostart] Display stabilization failed, restoring immediately:', err)
        startupMark('main:autostart-displays-stable-failed')
        restorePlaybackUsingSavedDisplays(config, 'autostart-fallback')
      })
  }

  powerMonitor.on('resume', () => {
    console.info('[runtime] powerMonitor resume')
    void reloadControlWindow('power-resume').catch((error) => {
      console.warn('[runtime] control window reload failed after resume:', error)
    })
    schedulePlaybackRecovery('power-resume')
  })

  powerMonitor.on('unlock-screen', () => {
    console.info('[runtime] powerMonitor unlock-screen')
    schedulePlaybackRecovery('unlock-screen')
  })

  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') {
      return
    }
    if (details.type !== 'GPU') {
      return
    }

    console.warn(
      `[runtime] child-process-gone type=${details.type} reason=${details.reason}`
    )
    void reloadControlWindow(`child-process-gone:${details.type}`).catch((error) => {
      console.warn('[runtime] control window reload failed after child process exit:', error)
    })
    schedulePlaybackRecovery(`child-process-gone:${details.type}`)
  })

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

// Handle second instance
app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows()
  const controlWindow = windows.find((w) => !w.isDestroyed())
  if (controlWindow) {
    if (controlWindow.isMinimized()) controlWindow.restore()
    controlWindow.focus()
  }
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  runtimeScheduleSyncService.stop()
  heartbeatService.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (playbackRecoveryTimer) {
    clearTimeout(playbackRecoveryTimer)
    playbackRecoveryTimer = null
  }
  runtimeScheduleSyncService.stop()
  heartbeatService.stop()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
