import { ipcMain, app, session, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppConfig,
  DeviceInfo,
  MqttConfig,
  TelemetryPayload,
  DeviceRevalidateResponse,
  PlayerHealthSnapshot,
  ReleaseManifest,
} from '../shared/ipc-types'
import { persistence } from './services/persistence'
import {
  backendClient,
  isBackendHttpErrorWithStatus,
} from './services/backend-client'
import {
  invalidationStatusesFor,
  type ProvisioningInvalidationContext,
} from './services/provisioning-invalidation-policy'
import { mqttService } from './services/mqtt-client'
import { contentCacheService } from './services/content-cache'
import { heartbeatService } from './services/heartbeat'
import { getDisplays } from './display-manager'
import {
  openPlaybackWindows,
  closeAllPlaybackWindows,
  getPlaybackWindows,
  isPlaybackRequested,
} from './windows'
import {
  deriveDisplayBindings,
  resolveDisplaysForPlayback,
} from './display-bindings'
import {
  updateExitShortcut,
  validateAccelerator,
  isAcceleratorAvailable,
} from './shortcut-manager'
import {
  getAutoLaunchSettings,
  setAutoLaunchEnabled,
} from './services/auto-launch'
import { buildCacheStatusAfterManualClear } from './services/cache-cleanup-policy'
import {
  decidePlaybackOpen,
  decidePlaybackClose,
} from './services/playback-control-policy'
import { runtimeScheduleSyncService } from './services/runtime-schedule-sync'
import { selectRelevantAssets } from './services/relevant-asset-policy'

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
    runtimeScheduleSyncService.stop()
    return persistence.getConfig()
  }

  function broadcastActivationInvalidated(reason: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.ACTIVATION_INVALIDATED, reason)
      }
    }
  }

  function handleProvisioningInvalidation(reason: string): AppConfig {
    const updated = resetActivationState()
    closeAllPlaybackWindows()
    mqttService.setBackendStatus('disconnected', reason)
    broadcastActivationInvalidated(reason)
    return updated
  }

  function isFatalProvisioningError(
    error: unknown,
    context: ProvisioningInvalidationContext
  ): boolean {
    return isBackendHttpErrorWithStatus(
      error,
      invalidationStatusesFor(context)
    )
  }

  heartbeatService.setProvisioningInvalidationHandler((reason) => {
    handleProvisioningInvalidation(reason)
  })

  function isManifestUsable(manifest: ReleaseManifest | null): manifest is ReleaseManifest {
    if (!manifest) return false
    if (!manifest.release_id || !manifest.schedule_id || !manifest.zone_id) return false
    if (!Array.isArray(manifest.slots) || !Array.isArray(manifest.assets)) return false
    return true
  }

  // ─── Config / Persistence ───────────────────────────────────────────

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return persistence.getConfig()
  })

  ipcMain.handle(IPC.CONFIG_SAVE, (_e, partial: Partial<AppConfig>) => {
    let nextPartial: Partial<AppConfig> = partial
    if (partial.selectedDisplayIds) {
      const displays = getDisplays()
      const bindings = deriveDisplayBindings(partial.selectedDisplayIds, displays)
      nextPartial = {
        ...partial,
        selectedDisplayBindings: bindings,
      }
      console.info(
        `[display-restore] Updated persisted display bindings from config save: ${bindings.length}`
      )
    }

    persistence.saveConfig(nextPartial)
    // Update heartbeat config if relevant fields changed
    const updated = persistence.getConfig()
    if (updated.activationState === 'activated' && updated.deviceToken) {
      heartbeatService.updateConfig(updated)
      runtimeScheduleSyncService.start()
    } else {
      runtimeScheduleSyncService.stop()
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
        runtimeScheduleSyncService.start()
        runtimeScheduleSyncService.triggerNow('activation')
        mqttService.setBackendStatus('connecting', null)

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
    const displays = getDisplays()
    const bindings = deriveDisplayBindings(ids, displays)
    persistence.saveConfig({
      selectedDisplayIds: ids,
      selectedDisplayBindings: bindings,
    })
    console.info(
      `[display-restore] Saved selected displays: ids=${ids.join(', ') || 'none'}, bindings=${bindings.length}`
    )
  })

  // ─── Playback Windows ──────────────────────────────────────────────

  ipcMain.handle(IPC.PLAYBACK_OPEN, () => {
    const openDecision = decidePlaybackOpen(
      getPlaybackWindows().size,
      isPlaybackRequested()
    )
    if (!openDecision.allowed) {
      return openDecision
    }

    const config = persistence.getConfig()
    const allDisplays = getDisplays()
    const resolved = resolveDisplaysForPlayback(config, allDisplays)
    for (const line of resolved.diagnostics) {
      console.info(line)
    }
    if (resolved.usedFallback) {
      console.warn('[display-restore] Playback opened with fallback display selection')
    } else if (resolved.selectedDisplays.length > 0) {
      const resolvedIds = resolved.selectedDisplays.map((display) => display.id)
      if (!sameIdOrder(config.selectedDisplayIds, resolvedIds)) {
        const bindings = deriveDisplayBindings(resolvedIds, allDisplays)
        persistence.saveConfig({
          selectedDisplayIds: resolvedIds,
          selectedDisplayBindings: bindings,
        })
        console.info(
          `[display-restore] Persisted remapped display ids after playback open: ${resolvedIds.join(', ')}`
        )
      }
    }
    openPlaybackWindows(resolved.selectedDisplays)
    return openDecision
  })

  ipcMain.handle(IPC.PLAYBACK_CLOSE, () => {
    const closeDecision = decidePlaybackClose(
      getPlaybackWindows().size,
      isPlaybackRequested()
    )
    if (!closeDecision.allowed) {
      return closeDecision
    }
    closeAllPlaybackWindows()
    return closeDecision
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
      const verification = await backendClient.verifyActivatedDevice(
        config.apiBaseUrl,
        config.deviceToken,
        config.deviceId
      )

      if (verification.status === 'missing') {
        const updated = handleProvisioningInvalidation(
          'Device provisioning is no longer valid in CMS'
        )
        return { status: 'missing', config: updated }
      }

      if (verification.status === 'exists') {
        const info = verification.info
        mqttService.setBackendStatus('connected', null)
        persistence.saveConfig({
          deviceName: info.device_name || null,
          zoneName: info.zone_name || null,
          groupName: info.group_name || null,
          zoneId: info.zone_id || null,
          groupId: info.group_id || null,
        })

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
          deviceName: info.device_name || null,
          zoneName: info.zone_name || null,
          groupName: info.group_name || null,
          zoneId: info.zone_id || null,
          groupId: info.group_id || null,
        })
        return info
      } catch (err) {
        if (isFatalProvisioningError(err, 'device-info')) {
          handleProvisioningInvalidation(
            'Device provisioning is no longer valid in CMS'
          )
        }
        return null
      }
    }
  )

  ipcMain.handle(IPC.BACKEND_FETCH_RELEASE, async () => {
    return runtimeScheduleSyncService.fetchLatestRelease()
  })

  ipcMain.handle(IPC.BACKEND_FETCH_MANIFEST, async (_e, releaseId: string) => {
    return runtimeScheduleSyncService.applyReleaseManifest(releaseId)
  })

  ipcMain.handle(
    IPC.BACKEND_DOWNLOAD_CONTENT,
    async (_e, url: string, assetId: string, contentType?: string) => {
      const config = persistence.getConfig()
      if (!config.deviceToken) throw new Error('Not authenticated')
      return contentCacheService.download(
        url,
        assetId,
        config.deviceToken,
        contentType
      )
    }
  )

  ipcMain.handle(
    IPC.BACKEND_GET_CACHED_CONTENT,
    (_e, assetId: string, contentType: string, url?: string) => {
      return contentCacheService.getLocalPath(assetId, contentType, url ?? '')
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
        if (isFatalProvisioningError(err, 'telemetry')) {
          handleProvisioningInvalidation(
            'Device provisioning is no longer valid in CMS'
          )
          throw new Error('Device provisioning is no longer valid')
        }
        const message = err instanceof Error ? err.message : 'Backend unreachable'
        mqttService.setBackendStatus('disconnected', message)
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC.HEALTH_GET_STATUS,
    (): PlayerHealthSnapshot => {
      const connection = mqttService.getStatus()
      const playbackState = persistence.getPlaybackState()
      const lastManifest = persistence.getLastManifest()
      const cache = persistence.getCacheStatus()

      return {
        online:
          connection.backend === 'connected'
          || connection.mqtt === 'connected',
        backend_status: connection.backend,
        mqtt_status: connection.mqtt,
        current_release_id:
          playbackState?.releaseId ?? lastManifest?.release_id ?? null,
        playback_status: playbackState?.status ?? 'idle',
        cache,
        heartbeat: heartbeatService.getStatus(),
        last_error: (
          connection.lastError
          ?? playbackState?.errors?.at(-1)
          ?? cache.last_error
        ) || null,
      }
    }
  )

  // ─── Connection / MQTT ──────────────────────────────────────────────

  ipcMain.handle(IPC.CONNECTION_STATUS, () => {
    return mqttService.getStatus()
  })

  ipcMain.handle(IPC.PLAYBACK_STATE, () => {
    return isPlaybackRequested() ? 'running' : 'stopped'
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

  ipcMain.handle(IPC.SETTINGS_GET_AUTOLAUNCH, () => {
    const status = getAutoLaunchSettings()
    persistence.saveConfig({ autoLaunchEnabled: status.enabled })
    return status
  })

  ipcMain.handle(IPC.SETTINGS_SET_AUTOLAUNCH, (_e, enabled: boolean) => {
    const status = setAutoLaunchEnabled(enabled)
    persistence.saveConfig({ autoLaunchEnabled: status.enabled })
    return status
  })

  ipcMain.handle(IPC.SETTINGS_GET_CACHE_INFO, () => {
    return contentCacheService.getCacheInfo()
  })

  ipcMain.handle(IPC.SETTINGS_CLEAR_CACHE, async () => {
    const mediaResult = contentCacheService.clearMediaCache()
    let browserCacheCleared = false

    try {
      await session.defaultSession.clearCache()
      browserCacheCleared = true
    } catch (err) {
      console.warn('[cache] Failed to clear browser cache:', err)
    }

    const manifest = persistence.getLastManifest()
    const verified = isManifestUsable(manifest)
      ? contentCacheService.verifyAssets(selectRelevantAssets(manifest).assets)
      : {
        total: 0,
        available: 0,
        missing: 0,
      }

    persistence.saveCacheStatus(
      buildCacheStatusAfterManualClear(
        isManifestUsable(manifest) ? manifest : null,
        verified,
        new Date().toISOString(),
        mediaResult.media_files_failed
      )
    )

    return {
      ...mediaResult,
      browser_cache_cleared: browserCacheCleared,
    }
  })
}

function sameIdOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
