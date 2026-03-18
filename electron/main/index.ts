import { app, BrowserWindow, Menu, globalShortcut } from 'electron'
import { createControlWindow, openPlaybackWindows } from './windows'
import { initDisplayManager, getDisplays } from './display-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { persistence } from './services/persistence'
import { heartbeatService } from './services/heartbeat'
import { mqttService } from './services/mqtt-client'
import { backendClient } from './services/backend-client'
import { contentCacheService } from './services/content-cache'
import {
  getAutoLaunchSettings,
  isLaunchedViaAutoLaunch,
} from './services/auto-launch'
import type { AppConfig, ReleaseManifest } from '../shared/ipc-types'

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function isManifestUsable(manifest: ReleaseManifest | null): manifest is ReleaseManifest {
  if (!manifest) return false
  if (!manifest.release_id || !manifest.schedule_id || !manifest.zone_id) return false
  if (!Array.isArray(manifest.slots) || !Array.isArray(manifest.assets)) return false
  return true
}

function openPlaybackUsingSavedDisplays(config: AppConfig): void {
  const allDisplays = getDisplays()
  const selected = allDisplays.filter((d) =>
    config.selectedDisplayIds.includes(d.id)
  )

  if (selected.length > 0) {
    openPlaybackWindows(selected)
    return
  }

  const primary = allDisplays.find((d) => d.isPrimary) ?? allDisplays[0]
  if (primary) {
    openPlaybackWindows([primary])
  }
}

async function syncScheduleOnAutoLaunch(config: AppConfig): Promise<void> {
  if (!config.deviceToken || !config.deviceId) return

  try {
    const release = await backendClient.fetchRelease(
      config.apiBaseUrl,
      config.deviceToken,
      config.deviceId
    )
    if (!release) return

    const manifest = await backendClient.fetchManifest(
      config.apiBaseUrl,
      config.deviceToken,
      release.release_id
    )
    if (!isManifestUsable(manifest)) {
      throw new Error('Manifest payload is invalid')
    }

    const prefetch = await contentCacheService.prefetchManifestAssets(
      manifest,
      config.deviceToken
    )
    const verified = contentCacheService.verifyManifestAssets(manifest)
    const now = new Date().toISOString()

    persistence.saveLastManifest(manifest)
    persistence.saveConfig({ lastSyncAt: now })

    let cleanupAt: string | null = persistence.getCacheStatus().last_cleanup_at
    if (verified.missing === 0) {
      contentCacheService.cleanupUnusedAssets(manifest)
      cleanupAt = now
    }

    persistence.saveCacheStatus({
      current_release_id: manifest.release_id,
      total_assets: verified.total,
      available_assets: verified.available,
      missing_assets: verified.missing,
      last_prefetch_at: now,
      last_cleanup_at: cleanupAt,
      last_error:
        prefetch.failed[0]
        ?? (verified.missing > 0
          ? `Missing ${verified.missing}/${verified.total} assets`
          : null),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    persistence.saveCacheStatus({ last_error: message })
    console.warn('[autostart] Startup sync failed:', message)
  }
}

app.whenReady().then(async () => {
  // Initialize persistence (load config from disk)
  await persistence.init()
  const autoLaunchStatus = getAutoLaunchSettings()
  if (autoLaunchStatus.supported) {
    persistence.saveConfig({ autoLaunchEnabled: autoLaunchStatus.enabled })
  }

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

  // Revalidate persisted activation: uninstall/reinstall can keep stale local credentials.
  const persistedConfig = persistence.getConfig()
  if (persistedConfig.activationState === 'activated' && persistedConfig.deviceId) {
    const existence = await backendClient.checkDeviceExists(
      persistedConfig.apiBaseUrl,
      persistedConfig.deviceId
    )

    if (existence === 'missing') {
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
      console.warn(
        '[startup] Persisted device is missing in CMS. Activation was reset.'
      )
    } else if (existence === 'unknown') {
      console.warn(
        '[startup] Could not verify device existence in CMS; keeping current activation state.'
      )
    }
  }

  // Create the main control window
  const controlWindow = createControlWindow()

  // Initialize display manager (monitors connected displays)
  initDisplayManager(controlWindow)

  // Start heartbeat and auto-connect MQTT if already activated
  const config = persistence.getConfig()
  if (config.activationState === 'activated' && config.deviceToken && config.deviceId) {
    heartbeatService.start(config)

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
    }
  }

  if (
    isLaunchedViaAutoLaunch()
    && config.autoLaunchEnabled
    && config.activationState === 'activated'
    && config.deviceToken
    && config.deviceId
  ) {
    void syncScheduleOnAutoLaunch(config)
    openPlaybackUsingSavedDisplays(config)
  }

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
  heartbeatService.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  heartbeatService.stop()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
