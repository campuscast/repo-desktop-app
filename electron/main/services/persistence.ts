import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type {
  AppConfig,
  CacheStatus,
  ReleaseManifest,
  PlaybackState,
} from '../../shared/ipc-types'

const DEFAULT_CONFIG: AppConfig = {
  deviceId: null,
  deviceName: null,
  deviceToken: null,
  mqttClientId: null,
  mqttTopicPrefix: null,
  tokenExpiresAt: null,
  apiBaseUrl: 'http://localhost:3000/api/v1',
  mqttBrokerUrl: 'mqtt://localhost:1883',
  activationState: 'unregistered',
  selectedDisplayIds: [],
  lastSyncAt: null,
  zoneId: null,
  groupId: null,
  zoneName: null,
  groupName: null,
  pendingActivationCode: null,
  pendingActivationRequestedAt: null,
  exitShortcutKey: 'Q',
  exitShortcutAccelerator: 'Ctrl+Alt+Shift+Q',
  locale: 'en',
  theme: 'dark',
  autoLaunchEnabled: false,
}

const DEFAULT_CACHE_STATUS: CacheStatus = {
  current_release_id: null,
  total_assets: 0,
  available_assets: 0,
  missing_assets: 0,
  last_prefetch_at: null,
  last_cleanup_at: null,
  last_error: null,
}

class PersistenceService {
  private dataDir = ''
  private config: AppConfig = { ...DEFAULT_CONFIG }
  private lastManifest: ReleaseManifest | null = null
  private cacheStatus: CacheStatus = { ...DEFAULT_CACHE_STATUS }

  async init(): Promise<void> {
    this.dataDir = join(app.getPath('userData'), 'player-data')
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
    // Merge defaults with loaded config so new fields are always present
    this.config = { ...DEFAULT_CONFIG, ...this.loadJson('config.json', DEFAULT_CONFIG) }
    this.lastManifest = this.loadJson<ReleaseManifest | null>(
      'last-manifest.json',
      null
    )
    this.cacheStatus = this.loadJson<CacheStatus>(
      'cache-status.json',
      { ...DEFAULT_CACHE_STATUS }
    )
  }

  getConfig(): AppConfig {
    return { ...this.config }
  }

  saveConfig(partial: Partial<AppConfig>): void {
    this.config = { ...this.config, ...partial }
    this.saveJson('config.json', this.config)
  }

  getLastManifest(): ReleaseManifest | null {
    return this.lastManifest
  }

  saveLastManifest(manifest: ReleaseManifest): void {
    this.lastManifest = manifest
    this.saveJson('last-manifest.json', manifest)
  }

  getCacheStatus(): CacheStatus {
    return { ...this.cacheStatus }
  }

  saveCacheStatus(status: Partial<CacheStatus>): void {
    this.cacheStatus = { ...this.cacheStatus, ...status }
    this.saveJson('cache-status.json', this.cacheStatus)
  }

  getContentDir(): string {
    const dir = join(this.dataDir, 'content')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  getContentFilePath(assetId: string, ext: string): string {
    return join(this.getContentDir(), `${assetId}${ext}`)
  }

  /** Check if a content file exists locally */
  hasContentFile(assetId: string, ext: string): boolean {
    return existsSync(this.getContentFilePath(assetId, ext))
  }

  savePlaybackState(state: PlaybackState): void {
    this.saveJson('playback-state.json', state)
  }

  getPlaybackState(): PlaybackState | null {
    return this.loadJson<PlaybackState | null>('playback-state.json', null)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private loadJson<T>(filename: string, fallback: T): T {
    const path = join(this.dataDir, filename)
    if (!existsSync(path)) return fallback
    try {
      const raw = readFileSync(path, 'utf-8')
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  private saveJson(filename: string, data: unknown): void {
    const path = join(this.dataDir, filename)
    try {
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error(`[persistence] Failed to write ${filename}:`, err)
    }
  }
}

export const persistence = new PersistenceService()
