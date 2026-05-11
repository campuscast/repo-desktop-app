import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
  AppConfig,
  Release,
  ReleaseManifest,
} from '../../shared/ipc-types'
import { withErrorTimestamp } from '../../shared/error-log'
import { backendClient } from './backend-client.js'
import { contentCacheService } from './content-cache.js'
import { mqttService } from './mqtt-client.js'
import { persistence } from './persistence.js'
import {
  RECOVERY_SYNC_INTERVAL_MS,
  computeSyncDelayMs,
  selectRelevantAssets,
} from './relevant-asset-policy.js'

const CACHE_MAINTENANCE_INTERVAL_MS = 30_000

function isManifestUsable(
  manifest: ReleaseManifest | null
): manifest is ReleaseManifest {
  if (!manifest) return false
  if (!manifest.release_id || !manifest.schedule_id || !manifest.zone_id) {
    return false
  }
  if (!Array.isArray(manifest.slots) || !Array.isArray(manifest.assets)) {
    return false
  }
  return true
}

function createSyntheticRelease(manifest: ReleaseManifest): Release {
  return {
    release_id: manifest.release_id,
    schedule_id: manifest.schedule_id,
    version_number: manifest.version_number,
    zone_id: manifest.zone_id,
    manifest_url: '',
    manifest_signature: 'cached',
    manifest_key_id: 'cached',
    status: 'active',
    published_at: manifest.created_at,
  }
}

class RuntimeScheduleSyncService {
  private running = false
  private syncTimer: NodeJS.Timeout | null = null
  private cacheTimer: NodeJS.Timeout | null = null
  private syncInFlight = false
  private cacheInFlight = false
  private pendingSyncReason: string | null = null
  private unsubscribeReleaseNotifications: (() => void) | null = null

  start(): void {
    if (this.running) return
    this.running = true
    this.unsubscribeReleaseNotifications = mqttService.onReleaseNotification(() => {
      this.triggerNow('mqtt-release')
    })
    this.scheduleNextSync(0, 'startup')
    this.cacheTimer = setInterval(() => {
      void this.maintainCurrentCache('interval')
    }, CACHE_MAINTENANCE_INTERVAL_MS)
    void this.maintainCurrentCache('startup')
  }

  stop(): void {
    this.running = false
    this.pendingSyncReason = null
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    if (this.cacheTimer) {
      clearInterval(this.cacheTimer)
      this.cacheTimer = null
    }
    if (this.unsubscribeReleaseNotifications) {
      this.unsubscribeReleaseNotifications()
      this.unsubscribeReleaseNotifications = null
    }
  }

  triggerNow(reason = 'manual'): void {
    if (!this.running) return
    if (this.syncInFlight) {
      this.pendingSyncReason = reason
      return
    }
    this.scheduleNextSync(0, reason)
  }

  async fetchLatestRelease(): Promise<Release | null> {
    const config = persistence.getConfig()
    if (!config.deviceToken || !config.deviceId) return null

    mqttService.setBackendStatus('connecting', null)
    try {
      const release = await backendClient.fetchRelease(
        config.apiBaseUrl,
        config.deviceToken,
        config.deviceId
      )
      if (!release) {
        this.clearCurrentSchedule('No active release from backend')
        mqttService.setBackendStatus('connected', null)
        return null
      }
      mqttService.setBackendStatus('connected', null)
      return release
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend unreachable'
      const fallback = this.getLastKnownGoodManifest(message)
      if (fallback) {
        mqttService.setBackendStatus(
          'disconnected',
          `Backend unavailable; using cached release (${message})`
        )
        return createSyntheticRelease(fallback)
      }

      persistence.saveCacheStatus({
        last_error: withErrorTimestamp(message),
      })
      mqttService.setBackendStatus('disconnected', message)
      return null
    }
  }

  async applyReleaseManifest(releaseId: string): Promise<ReleaseManifest> {
    const config = persistence.getConfig()
    if (!config.deviceToken) {
      throw new Error('Not authenticated')
    }

    mqttService.setBackendStatus('connecting', null)
    try {
      const manifest = await backendClient.fetchManifest(
        config.apiBaseUrl,
        config.deviceToken,
        releaseId
      )

      if (!isManifestUsable(manifest)) {
        throw new Error('Manifest payload is invalid')
      }

      const now = new Date()
      const selection = selectRelevantAssets(manifest, now)
      const prefetch = await contentCacheService.prefetchAssets(
        selection.assets,
        config.deviceToken
      )
      const verified = contentCacheService.verifyAssets(selection.assets)
      const nowIso = now.toISOString()

      if (prefetch.failed.length > 0) {
        const fallback = this.getLastKnownGoodManifest(
          `Manifest prefetch incomplete (${prefetch.failed.length} failed asset downloads)`
        )
        if (fallback) {
          return this.applyFallbackManifest(
            fallback,
            prefetch.failed[0]
              ? withErrorTimestamp(prefetch.failed[0], now)
              : withErrorTimestamp(
                'Manifest prefetch incomplete',
                now
              )
          )
        }
      }

      persistence.saveLastManifest(manifest)
      persistence.saveConfig({ lastSyncAt: nowIso })

      let cleanupAt = persistence.getCacheStatus().last_cleanup_at
      if (verified.missing === 0) {
        contentCacheService.cleanupUnusedAssetsForAssets(selection.assets)
        cleanupAt = nowIso
      }

      persistence.saveCacheStatus({
        current_release_id: manifest.release_id,
        total_assets: verified.total,
        available_assets: verified.available,
        missing_assets: verified.missing,
        last_prefetch_at: nowIso,
        last_cleanup_at: cleanupAt,
        last_error:
          prefetch.failed[0]
            ? withErrorTimestamp(prefetch.failed[0], now)
            : (verified.missing > 0
              ? withErrorTimestamp(
                `Missing ${verified.missing}/${verified.total} assets`,
                now
              )
              : null),
      })

      mqttService.setBackendStatus(
        verified.missing === 0 ? 'connected' : 'disconnected',
        verified.missing === 0
          ? null
          : `Managed cache missing assets (${verified.missing}/${verified.total})`
      )
      this.broadcastManifest(manifest)
      return manifest
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend unreachable'
      const fallback = this.getLastKnownGoodManifest(message)
      if (fallback) {
        return this.applyFallbackManifest(
          fallback,
          withErrorTimestamp(message)
        )
      }

      persistence.saveCacheStatus({
        last_error: withErrorTimestamp(message),
      })
      mqttService.setBackendStatus('disconnected', message)
      throw err
    }
  }

  async syncLatestRelease(reason = 'scheduled'): Promise<ReleaseManifest | null> {
    const config = persistence.getConfig()
    if (!this.hasActivatedConfig(config)) {
      return null
    }

    mqttService.setBackendStatus('connecting', null)
    try {
      const release = await backendClient.fetchRelease(
        config.apiBaseUrl,
        config.deviceToken!,
        config.deviceId!
      )
      if (!release) {
        this.clearCurrentSchedule(`No active release from backend (${reason})`)
        mqttService.setBackendStatus('connected', null)
        return null
      }
      return await this.applyReleaseManifest(release.release_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend unreachable'
      const fallback = this.getLastKnownGoodManifest(message)
      if (fallback) {
        return this.applyFallbackManifest(
          fallback,
          withErrorTimestamp(message)
        )
      }

      persistence.saveCacheStatus({
        last_error: withErrorTimestamp(message),
      })
      mqttService.setBackendStatus('disconnected', message)
      return null
    }
  }

  async maintainCurrentCache(reason = 'manual'): Promise<void> {
    if (this.cacheInFlight) return
    const config = persistence.getConfig()
    const manifest = persistence.getLastManifest()
    if (!this.hasActivatedConfig(config) || !isManifestUsable(manifest)) {
      return
    }

    this.cacheInFlight = true
    try {
      const now = new Date()
      const selection = selectRelevantAssets(manifest, now)
      const prefetch = await contentCacheService.prefetchAssets(
        selection.assets,
        config.deviceToken!
      )
      const verified = contentCacheService.verifyAssets(selection.assets)
      const nowIso = now.toISOString()

      let cleanupAt = persistence.getCacheStatus().last_cleanup_at
      if (verified.missing === 0) {
        contentCacheService.cleanupUnusedAssetsForAssets(selection.assets)
        cleanupAt = nowIso
      }

      const lastError =
        prefetch.failed[0]
          ? withErrorTimestamp(prefetch.failed[0], now)
          : (verified.missing > 0
            ? withErrorTimestamp(
              `Managed cache missing assets (${verified.missing}/${verified.total})`,
              now
            )
            : null)

      persistence.saveCacheStatus({
        current_release_id: manifest.release_id,
        total_assets: verified.total,
        available_assets: verified.available,
        missing_assets: verified.missing,
        last_prefetch_at: nowIso,
        last_cleanup_at: cleanupAt,
        last_error: lastError,
      })

      if (verified.missing > 0) {
        mqttService.setBackendStatus(
          'disconnected',
          `Managed cache missing assets (${verified.missing}/${verified.total})`
        )
      }
    } finally {
      this.cacheInFlight = false
    }
  }

  private applyFallbackManifest(
    manifest: ReleaseManifest,
    lastError: string
  ): ReleaseManifest {
    const now = new Date().toISOString()
    const selection = selectRelevantAssets(manifest)
    const verified = contentCacheService.verifyAssets(selection.assets)

    let cleanupAt = persistence.getCacheStatus().last_cleanup_at
    if (verified.missing === 0) {
      contentCacheService.cleanupUnusedAssetsForAssets(selection.assets)
      cleanupAt = now
    }

    persistence.saveCacheStatus({
      current_release_id: manifest.release_id,
      total_assets: verified.total,
      available_assets: verified.available,
      missing_assets: verified.missing,
      last_prefetch_at: now,
      last_cleanup_at: cleanupAt,
      last_error: lastError,
    })
    mqttService.setBackendStatus(
      'disconnected',
      `Using cached manifest (${lastError.replace(/^\[[^\]]+\]\s*/, '')})`
    )
    this.broadcastManifest(manifest)
    return manifest
  }

  private clearCurrentSchedule(reason: string): void {
    const nowIso = new Date().toISOString()
    persistence.clearLastManifest()
    contentCacheService.clearMediaCache()
    persistence.saveConfig({ lastSyncAt: nowIso })
    persistence.saveCacheStatus({
      current_release_id: null,
      total_assets: 0,
      available_assets: 0,
      missing_assets: 0,
      last_prefetch_at: nowIso,
      last_cleanup_at: nowIso,
      last_error: null,
    })
    this.broadcastManifest(null)
    console.info(`[schedule-sync] Cleared current schedule: ${reason}`)
  }

  private getLastKnownGoodManifest(reason: string): ReleaseManifest | null {
    const cached = persistence.getLastManifest()
    if (!isManifestUsable(cached)) {
      return null
    }

    console.warn(`[schedule-sync] Falling back to cached manifest: ${reason}`)
    return cached
  }

  private broadcastManifest(manifest: ReleaseManifest | null): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.PLAYBACK_SCHEDULE_UPDATE, manifest)
      }
    }
  }

  private scheduleNextSync(delayMs: number, reason: string): void {
    if (!this.running) return
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }

    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.runScheduledSync(reason)
    }, delayMs)
  }

  private async runScheduledSync(reason: string): Promise<void> {
    if (this.syncInFlight) {
      this.pendingSyncReason = reason
      return
    }

    this.syncInFlight = true
    try {
      await this.syncLatestRelease(reason)
      await this.maintainCurrentCache(reason)
    } finally {
      this.syncInFlight = false
      if (!this.running) return

      if (this.pendingSyncReason) {
        const nextReason = this.pendingSyncReason
        this.pendingSyncReason = null
        this.scheduleNextSync(0, nextReason)
        return
      }

      this.scheduleNextSync(this.computeNextSyncDelayMs(), 'scheduled')
    }
  }

  private computeNextSyncDelayMs(): number {
    if (mqttService.getStatus().backend === 'disconnected') {
      return RECOVERY_SYNC_INTERVAL_MS
    }

    const manifest = persistence.getLastManifest()
    if (!isManifestUsable(manifest)) {
      return RECOVERY_SYNC_INTERVAL_MS
    }

    return computeSyncDelayMs(manifest)
  }

  private hasActivatedConfig(config: AppConfig): boolean {
    return Boolean(
      config.activationState === 'activated'
        && config.deviceToken
        && config.deviceId
    )
  }
}

export const runtimeScheduleSyncService = new RuntimeScheduleSyncService()
