import { ipcMain, app } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppConfig,
  DeviceInfo,
  MqttConfig,
  TelemetryPayload,
  DeviceRevalidateResponse,
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
import {
  updateExitShortcut,
  validateAccelerator,
  isAcceleratorAvailable,
} from './shortcut-manager'

export function registerIpcHandlers(): void {
  function resetActivationState(): AppConfig {
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
    return persistence.getConfig()
  }

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
        // Credentials are not complete yet (e.g. backend returned a partial response).
        // Keep polling until a token is available.
        if (!creds.device_token) {
          return null
        }

        // Save credentials and mark activated.
        // Keep the original short-format deviceId (XXXX-XXXX-XXXX-XXXX) entered
        // by the user — do NOT overwrite it with the full UUID from the backend.
        persistence.saveConfig({
          deviceToken: creds.device_token,
          mqttClientId: creds.mqtt_client_id,
          mqttTopicPrefix: creds.mqtt_topic_prefix,
          activationState: 'activated',
          zoneName: creds.zone_name ?? null,
          groupName: creds.group_name ?? null,
          pendingActivationCode: null,
          pendingActivationRequestedAt: null,
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

  ipcMain.handle(
    IPC.BACKEND_REVALIDATE_DEVICE,
    async (): Promise<DeviceRevalidateResponse> => {
      const config = persistence.getConfig()
      if (
        config.activationState !== 'activated'
        || !config.deviceId
        || !config.deviceToken
      ) {
        return { status: 'unregistered', config }
      }

      mqttService.setBackendStatus('connecting', null)
      const existence = await backendClient.checkDeviceExists(
        config.apiBaseUrl,
        config.deviceId
      )

      if (existence === 'missing') {
        const updated = resetActivationState()
        mqttService.setBackendStatus('disconnected', 'Device was removed from CMS')
        return { status: 'missing', config: updated }
      }

      if (existence === 'exists') {
        mqttService.setBackendStatus('connected', null)

        // Refresh zone/group names from backend
        try {
          const info = await backendClient.fetchDeviceInfo(
            config.apiBaseUrl,
            config.deviceToken,
            config.deviceId
          )
          persistence.saveConfig({
            zoneName: info.zone_name || null,
            groupName: info.group_name || null,
            zoneId: info.zone_id || null,
            groupId: info.group_id || null,
          })
        } catch {
          // Non-fatal: zone/group refresh is best-effort
        }

        const updated = persistence.getConfig()
        return { status: 'exists', config: updated }
      }

      mqttService.setBackendStatus(
        'disconnected',
        'Could not verify device in CMS'
      )
      return { status: 'unknown', config }
    }
  )

  ipcMain.handle(
    IPC.BACKEND_FETCH_DEVICE_INFO,
    async (): Promise<DeviceInfo | null> => {
      const config = persistence.getConfig()
      if (!config.deviceToken || !config.deviceId) return null
      try {
        const info = await backendClient.fetchDeviceInfo(
          config.apiBaseUrl,
          config.deviceToken,
          config.deviceId
        )
        persistence.saveConfig({
          zoneName: info.zone_name || null,
          groupName: info.group_name || null,
          zoneId: info.zone_id || null,
          groupId: info.group_id || null,
        })
        return info
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(IPC.BACKEND_FETCH_RELEASE, async () => {
    const config = persistence.getConfig()
    if (!config.deviceToken || !config.deviceId) return null

    mqttService.setBackendStatus('connecting', null)
    try {
      const release = await backendClient.fetchRelease(
        config.apiBaseUrl,
        config.deviceToken,
        config.deviceId
      )
      mqttService.setBackendStatus('connected', null)
      return release
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend unreachable'
      mqttService.setBackendStatus('disconnected', message)
      return null
    }
  })

  ipcMain.handle(IPC.BACKEND_FETCH_MANIFEST, async (_e, releaseId: string) => {
    const config = persistence.getConfig()
    if (!config.deviceToken) throw new Error('Not authenticated')

    mqttService.setBackendStatus('connecting', null)
    try {
      const manifest = await backendClient.fetchManifest(
        config.apiBaseUrl,
        config.deviceToken,
        releaseId
      )
      // Cache manifest locally
      persistence.saveLastManifest(manifest)
      persistence.saveConfig({ lastSyncAt: new Date().toISOString() })
      mqttService.setBackendStatus('connected', null)
      return manifest
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend unreachable'
      mqttService.setBackendStatus('disconnected', message)
      throw err
    }
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
      try {
        await backendClient.sendTelemetry(
          config.apiBaseUrl,
          config.deviceToken,
          payload
        )
        mqttService.setBackendStatus('connected', null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Backend unreachable'
        mqttService.setBackendStatus('disconnected', message)
        throw err
      }
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
    const config = persistence.getConfig()
    return config.exitShortcutAccelerator || `Ctrl+Alt+Shift+${config.exitShortcutKey}`
  })

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUT, (_e, accelerator: string) => {
    updateExitShortcut(accelerator)
    return persistence.getConfig()
  })

  ipcMain.handle(
    IPC.SETTINGS_VALIDATE_SHORTCUT,
    (_e, accelerator: string): { valid: boolean; reason?: string; available?: boolean } => {
      const validation = validateAccelerator(accelerator)
      if (!validation.valid) {
        return { valid: false, reason: validation.reason }
      }
      const available = isAcceleratorAvailable(accelerator)
      if (!available) {
        return { valid: false, reason: 'This shortcut is already in use by another application' }
      }
      return { valid: true, available: true }
    }
  )
}
