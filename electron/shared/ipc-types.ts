/** Typed IPC contracts — defines request/response shapes for every channel */

// ─── Domain models used across IPC ──────────────────────────────────────────

export type Locale = 'en' | 'ru'
export type Theme = 'light' | 'dark' | 'system'

export interface AppConfig {
  deviceId: string | null
  deviceName: string | null
  deviceToken: string | null
  mqttClientId: string | null
  mqttTopicPrefix: string | null
  tokenExpiresAt: string | null
  apiBaseUrl: string
  mqttBrokerUrl: string
  activationState: ActivationState
  selectedDisplayIds: string[]
  selectedDisplayBindings: PersistedDisplayBinding[]
  lastSyncAt: string | null
  zoneId: string | null
  groupId: string | null
  zoneName: string | null
  groupName: string | null
  pendingActivationCode: string | null
  pendingActivationRequestedAt: string | null
  exitShortcutKey: string
  /** Full Electron accelerator string, e.g. "Ctrl+Alt+Shift+Q" */
  exitShortcutAccelerator: string
  locale: Locale
  theme: Theme
  /** Preferred IANA timezone (e.g. "Europe/Moscow") or "system". */
  timeZone: string
  autoLaunchEnabled: boolean
}

export interface AutoLaunchSettings {
  enabled: boolean
  supported: boolean
}

export interface CacheInfo {
  content_dir: string
  media_files: number
  total_bytes: number
}

export interface CacheClearResult {
  media_files_removed: number
  media_files_failed: number
  bytes_reclaimed: number
  browser_cache_cleared: boolean
}

export type ActivationState = 'unregistered' | 'pending' | 'activated'

export interface DeviceCredentials {
  device_id: string
  device_token: string
  mqtt_client_id: string
  mqtt_topic_prefix: string
  token_expires_at?: string
  zone_name?: string
  group_name?: string
}

export interface DeviceInfo {
  device_id: string
  device_name: string
  zone_id: string
  group_id: string
  zone_name: string
  group_name: string
}

export interface DisplayInfo {
  id: string
  label: string
  width: number
  height: number
  x: number
  y: number
  workAreaX: number
  workAreaY: number
  workAreaWidth: number
  workAreaHeight: number
  isPrimary: boolean
  scaleFactor: number
  internal: boolean
  rotation: number
}

export interface PersistedDisplayBinding {
  id: string
  label: string
  isPrimary: boolean
  width: number
  height: number
  x: number
  y: number
  workAreaX: number
  workAreaY: number
  workAreaWidth: number
  workAreaHeight: number
  scaleFactor: number
  internal: boolean
  rotation: number
  capturedAt: string
}

export interface ConnectionStatus {
  backend: 'connected' | 'disconnected' | 'connecting'
  mqtt: 'connected' | 'disconnected' | 'connecting'
  lastError: string | null
}

export interface ReleaseNotification {
  release_id: string
  manifest_hash: string
  published_at: string
}

// ─── Schedule / Playback ────────────────────────────────────────────────────

export interface SlotMetadata {
  transition_type?: 'cut' | 'fade'
  transition_duration_ms?: number
  video_trim_in_ms?: number
  video_trim_out_ms?: number
  video_mute?: boolean
  video_loop?: boolean
}

export interface ScheduleSlot {
  slot_id: string
  asset_id: string
  publication_id?: string
  start_time: string // ISO 8601
  end_time: string   // ISO 8601
  priority: number
  zone_id: string
  group_id: string
  metadata?: SlotMetadata
}

export interface Release {
  release_id: string
  schedule_id: string
  version_number: number
  zone_id: string
  manifest_url: string
  manifest_signature: string
  manifest_key_id: string
  status: 'pending' | 'rolling_out' | 'active' | 'rolled_back'
  published_at: string
}

export interface ContentAsset {
  asset_id: string
  filename: string
  content_type: string
  file_size: number
  sha256_hash: string
  download_url: string
  metadata: Record<string, string>
}

export interface PublicationItemTransition {
  type?: 'cut' | 'fade'
  duration_ms?: number
}

export interface PublicationSlidePayload {
  background?: string
  title?: string
  body?: string
  image_asset_id?: string
  logo_asset_id?: string
  layout?: 'centered' | 'split' | 'title-top'
  image_fit?: 'cover' | 'contain' | 'stretch' | 'center'
  text_overlay?: boolean
}

export interface PublicationVideoPayload {
  asset_id?: string
  trim_in_ms?: number
  trim_out_ms?: number
  mute?: boolean
  loop?: boolean
}

export interface PublicationItem {
  item_id?: string
  type: 'custom_slide' | 'video_asset'
  title?: string
  duration_ms?: number
  transition?: PublicationItemTransition
  slide?: PublicationSlidePayload
  video?: PublicationVideoPayload
  metadata?: Record<string, unknown>
}

export interface Publication {
  publication_id: string
  zone_id: string
  title: string
  type: string
  status: string
  version: number
  items: PublicationItem[]
  metadata?: Record<string, unknown>
}

export interface ReleaseManifest {
  release_id: string
  schedule_id: string
  version_number: number
  zone_id: string
  slots: ScheduleSlot[]
  assets: ContentAsset[]
  publications?: Publication[]
  manifest_hash: string
  created_at: string
}

export interface PlaybackState {
  status: 'idle' | 'playing' | 'loading' | 'error' | 'offline'
  currentSlot: ScheduleSlot | null
  currentAsset: ContentAsset | null
  currentPublication: Publication | null
  currentPublicationItem: PublicationItem | null
  nextSlot: ScheduleSlot | null
  releaseId: string | null
  errors: string[]
  updatedAt: string
}

export interface CacheStatus {
  current_release_id: string | null
  total_assets: number
  available_assets: number
  missing_assets: number
  last_prefetch_at: string | null
  last_cleanup_at: string | null
  last_error: string | null
}

export interface HeartbeatStatus {
  running: boolean
  interval_ms: number
  last_attempt_at: string | null
  last_success_at: string | null
  last_error: string | null
}

export interface PlayerHealthSnapshot {
  online: boolean
  backend_status: ConnectionStatus['backend']
  mqtt_status: ConnectionStatus['mqtt']
  current_release_id: string | null
  playback_status: PlaybackState['status']
  cache: CacheStatus
  heartbeat: HeartbeatStatus
  last_error: string | null
}

export interface TelemetryPayload {
  device_id: string
  current_release_id: string | null
  playback_status: string
  current_slot_id: string | null
  errors: string[]
  displays: DisplayInfo[]
  selected_displays: string[]
  timestamp: string
  online?: boolean
  backend_status?: ConnectionStatus['backend']
  mqtt_status?: ConnectionStatus['mqtt']
  cache?: CacheStatus
  last_error?: string | null
}

// ─── IPC Request / Response map ─────────────────────────────────────────────

export interface ActivationCodeResponse {
  activation_code: string
  expires_in: number
}

export interface MqttConfig {
  brokerUrl: string
  clientId: string
  topicPrefix: string
  deviceToken: string
}

export type DevicePresenceStatus =
  | 'exists'
  | 'missing'
  | 'unknown'
  | 'unregistered'

export interface DeviceRevalidateResponse {
  status: DevicePresenceStatus
  config: AppConfig
}

export type WindowMode = 'control' | 'playback'
export type PlaybackSessionState = 'stopped' | 'running'

export interface PlaybackCommandResult {
  allowed: boolean
  reason: 'ok' | 'already-running' | 'already-stopped'
}
