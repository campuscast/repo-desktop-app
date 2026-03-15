/** Typed IPC contracts — defines request/response shapes for every channel */

// ─── Domain models used across IPC ──────────────────────────────────────────

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
  lastSyncAt: string | null
  zoneId: string | null
  groupId: string | null
  zoneName: string | null
  groupName: string | null
  exitShortcutKey: string
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

export interface DisplayInfo {
  id: string
  label: string
  width: number
  height: number
  x: number
  y: number
  isPrimary: boolean
  scaleFactor: number
  internal: boolean
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

export interface ScheduleSlot {
  slot_id: string
  asset_id: string
  start_time: string // ISO 8601
  end_time: string   // ISO 8601
  priority: number
  zone_id: string
  group_id: string
  metadata: Record<string, string>
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

export interface ReleaseManifest {
  release_id: string
  schedule_id: string
  version_number: number
  zone_id: string
  slots: ScheduleSlot[]
  assets: ContentAsset[]
  manifest_hash: string
  created_at: string
}

export interface PlaybackState {
  status: 'idle' | 'playing' | 'loading' | 'error' | 'offline'
  currentSlot: ScheduleSlot | null
  currentAsset: ContentAsset | null
  nextSlot: ScheduleSlot | null
  releaseId: string | null
  errors: string[]
  updatedAt: string
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

export type WindowMode = 'control' | 'playback'
