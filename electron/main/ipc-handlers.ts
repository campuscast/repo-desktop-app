import { ipcMain, app } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppConfig,
  MqttConfig,
  TelemetryPayload,
} from '../shared/ipc-types'
import { persistence } from './services/persistence'
import { backendClient } from './services/backend-client'
import { mqttService } from './services/mqtt-client'
import { contentCacheService } from './services/content-cache'
import { heartbeatService } from './services/heartbeat'
import { getDisplays } from './display-manager'
import {
  openPlaybackWindows,
  closeAllPlaybackWindows,
} from './windows'

export function registerIpcHandlers(): void {
  // ─── Config / Persistence ───────────────────────────────────────────

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return persistence.getConfig()
  })

  ipcMain.handle(IPC.CONFIG_SAVE, (_e, partial: Partial<AppConfig>) => {
    persistence.saveConfig(partial)
    // Update heartbeat config if relevant fields changed
    const updated = persistence.getConfig()
    if (updated.activationState === 'activated' && updated.deviceToken) {
      heartbeatService.updateConfig(updated)
    }
    return updated
  })

  // ─── Activation ─────────────────────────────────────────────────────

  ipcMain.handle(IPC.ACTIVATION_REQUEST_CODE, async (_e, deviceId: string) => {
    const config = persistence.getConfig()
    return backendClient.requestActivationCode(config.apiBaseUrl, deviceId)
  })

  ipcMain.handle(
    IPC.ACTIVATION_POLL_CREDENTIALS,
    async (_e, deviceId: string, code: string) => {
      const config = persistence.getConfig()
      const creds = await backendClient.pollCredentials(
        config.apiBaseUrl,
        deviceId,
        code
      )

      if (creds) {
        // Save credentials and mark activated
        persistence.saveConfig({
          deviceId: creds.device_id,
          deviceToken: creds.device_token,
          mqttClientId: creds.mqtt_client_id,
          mqttTopicPrefix: creds.mqtt_topic_prefix,
          activationState: 'activated',
          zoneName: creds.zone_name ?? null,
          groupName: creds.group_name ?? null,
        })

        // Start heartbeat
        const updatedConfig = persistence.getConfig()
        heartbeatService.start(updatedConfig)

        // Auto-connect MQTT
        if (creds.mqtt_client_id && updatedConfig.mqttBrokerUrl) {
          await mqttService.connect({
            brokerUrl: updatedConfig.mqttBrokerUrl,
            clientId: creds.mqtt_client_id,
            topicPrefix: creds.mqtt_topic_prefix,
            deviceToken: creds.device_token,
          })
        }
      }

      return creds
    }
  )

  // ─── Display Management ─────────────────────────────────────────────

  ipcMain.handle(IPC.DISPLAYS_GET, () => {
    return getDisplays()
  })

  ipcMain.handle(IPC.DISPLAYS_GET_SELECTED, () => {
    return persistence.getConfig().selectedDisplayIds
  })

  ipcMain.handle(IPC.DISPLAYS_SET_SELECTED, (_e, ids: string[]) => {
    persistence.saveConfig({ selectedDisplayIds: ids })
  })

  // ─── Playback Windows ──────────────────────────────────────────────

  ipcMain.handle(IPC.PLAYBACK_OPEN, () => {
    const config = persistence.getConfig()
    const allDisplays = getDisplays()
    const selected = allDisplays.filter((d) =>
      config.selectedDisplayIds.includes(d.id)
    )
    if (selected.length === 0 && allDisplays.length > 0) {
      // Fallback: use primary display
      const primary = allDisplays.find((d) => d.isPrimary) ?? allDisplays[0]
      openPlaybackWindows([primary])
    } else {
      openPlaybackWindows(selected)
    }
  })

  ipcMain.handle(IPC.PLAYBACK_CLOSE, () => {
    closeAllPlaybackWindows()
  })

  // ─── Backend Communication ──────────────────────────────────────────

  ipcMain.handle(IPC.BACKEND_FETCH_RELEASE, async () => {
    const config = persistence.getConfig()
    if (!config.deviceToken || !config.deviceId) return null
    const release = await backendClient.fetchRelease(
      config.apiBaseUrl,
      config.deviceToken,
      config.deviceId
    )
    return release
  })

  ipcMain.handle(IPC.BACKEND_FETCH_MANIFEST, async (_e, releaseId: string) => {
    const config = persistence.getConfig()
    if (!config.deviceToken) throw new Error('Not authenticated')
    const manifest = await backendClient.fetchManifest(
      config.apiBaseUrl,
      config.deviceToken,
      releaseId
    )
    // Cache manifest locally
    persistence.saveLastManifest(manifest)
    persistence.saveConfig({ lastSyncAt: new Date().toISOString() })
    return manifest
  })

  ipcMain.handle(
    IPC.BACKEND_DOWNLOAD_CONTENT,
    async (_e, url: string, assetId: string) => {
      const config = persistence.getConfig()
      if (!config.deviceToken) throw new Error('Not authenticated')
      return contentCacheService.download(url, assetId, config.deviceToken)
    }
  )

  ipcMain.handle(
    IPC.BACKEND_SEND_TELEMETRY,
    async (_e, payload: TelemetryPayload) => {
      const config = persistence.getConfig()
      if (!config.deviceToken) return
      await backendClient.sendTelemetry(
        config.apiBaseUrl,
        config.deviceToken,
        payload
      )
    }
  )

  // ─── Connection / MQTT ──────────────────────────────────────────────

  ipcMain.handle(IPC.CONNECTION_STATUS, () => {
    return mqttService.getStatus()
  })

  ipcMain.handle(IPC.MQTT_CONNECT, async (_e, config: MqttConfig) => {
    await mqttService.connect(config)
  })

  ipcMain.handle(IPC.MQTT_DISCONNECT, () => {
    mqttService.disconnect()
  })

  // ─── Window Mode ───────────────────────────────────────────────────

  ipcMain.handle(IPC.WINDOW_GET_MODE, (e) => {
    const url = e.sender.getURL()
    const params = new URL(url).searchParams
    return params.get('mode') ?? 'control'
  })

  ipcMain.handle(IPC.WINDOW_GET_DISPLAY_ID, (e) => {
    const url = e.sender.getURL()
    const params = new URL(url).searchParams
    return params.get('displayId') ?? null
  })

  // ─── App ───────────────────────────────────────────────────────────

  ipcMain.handle(IPC.APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC.APP_PLATFORM, () => {
    return process.platform
  })

  ipcMain.handle(IPC.APP_QUIT, () => {
    app.quit()
  })

  // ─── Settings ─────────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET_SHORTCUT, () => {
    return persistence.getConfig().exitShortcutKey
  })

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUT, (_e, key: string) => {
    const { updateExitShortcutKey } = require('./shortcut-manager')
    updateExitShortcutKey(key)
    return persistence.getConfig()
  })
}
