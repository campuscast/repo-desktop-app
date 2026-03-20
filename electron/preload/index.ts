import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppConfig,
  ActivationCodeResponse,
  DeviceCredentials,
  DeviceInfo,
  DisplayInfo,
  ConnectionStatus,
  ReleaseNotification,
  Release,
  ReleaseManifest,
  TelemetryPayload,
  MqttConfig,
  PlaybackCommandResult,
  PlaybackSessionState,
  WindowMode,
  DeviceRevalidateResponse,
  PlayerHealthSnapshot,
  AutoLaunchSettings,
  CacheInfo,
  CacheClearResult,
} from '../shared/ipc-types'

export interface ElectronAPI {
  // Config
  getConfig(): Promise<AppConfig>
  saveConfig(partial: Partial<AppConfig>): Promise<AppConfig>

  // Activation
  requestActivationCode(deviceId: string): Promise<ActivationCodeResponse>
  pollCredentials(
    deviceId: string,
    code: string
  ): Promise<DeviceCredentials | null>

  // Displays
  getDisplays(): Promise<DisplayInfo[]>
  getSelectedDisplays(): Promise<string[]>
  setSelectedDisplays(ids: string[]): Promise<void>

  // Playback windows
  openPlaybackWindows(): Promise<PlaybackCommandResult>
  closePlaybackWindows(): Promise<PlaybackCommandResult>
  getPlaybackSessionState(): Promise<PlaybackSessionState>

  // Backend
  fetchRelease(): Promise<Release | null>
  fetchManifest(releaseId: string): Promise<ReleaseManifest>
  downloadContent(url: string, assetId: string, contentType?: string): Promise<string>
  getCachedContentPath(assetId: string, contentType: string, url?: string): Promise<string | null>
  sendTelemetry(payload: TelemetryPayload): Promise<void>
  revalidateDevice(): Promise<DeviceRevalidateResponse>
  fetchDeviceInfo(): Promise<DeviceInfo | null>
  getHealthStatus(): Promise<PlayerHealthSnapshot>

  // Connection
  getConnectionStatus(): Promise<ConnectionStatus>
  connectMqtt(config: MqttConfig): Promise<void>
  disconnectMqtt(): Promise<void>

  // Window
  getWindowMode(): Promise<WindowMode>
  getPlaybackDisplayId(): Promise<string | null>

  // App
  getAppVersion(): Promise<string>
  getAppPlatform(): Promise<string>
  quit(): Promise<void>

  // Settings
  getExitShortcut(): Promise<string>
  setExitShortcut(accelerator: string): Promise<AppConfig>
  validateShortcut(accelerator: string): Promise<{ valid: boolean; reason?: string; available?: boolean }>
  getAutoLaunchSettings(): Promise<AutoLaunchSettings>
  setAutoLaunchEnabled(enabled: boolean): Promise<AutoLaunchSettings>
  getCacheInfo(): Promise<CacheInfo>
  clearCache(): Promise<CacheClearResult>
  startupMark(stage: string, details?: string): void

  // Events (main → renderer)
  onDisplaysChanged(cb: (displays: DisplayInfo[]) => void): () => void
  onConnectionStatusChanged(cb: (status: ConnectionStatus) => void): () => void
  onNewRelease(cb: (notification: ReleaseNotification) => void): () => void
  onPlaybackScheduleUpdate(
    cb: (manifest: ReleaseManifest) => void
  ): () => void
  onActivationInvalidated(cb: (reason: string) => void): () => void
}

const api: ElectronAPI = {
  // Config
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  saveConfig: (partial) => ipcRenderer.invoke(IPC.CONFIG_SAVE, partial),

  // Activation
  requestActivationCode: (deviceId) =>
    ipcRenderer.invoke(IPC.ACTIVATION_REQUEST_CODE, deviceId),
  pollCredentials: (deviceId, code) =>
    ipcRenderer.invoke(IPC.ACTIVATION_POLL_CREDENTIALS, deviceId, code),

  // Displays
  getDisplays: () => ipcRenderer.invoke(IPC.DISPLAYS_GET),
  getSelectedDisplays: () => ipcRenderer.invoke(IPC.DISPLAYS_GET_SELECTED),
  setSelectedDisplays: (ids) =>
    ipcRenderer.invoke(IPC.DISPLAYS_SET_SELECTED, ids),

  // Playback windows
  openPlaybackWindows: () => ipcRenderer.invoke(IPC.PLAYBACK_OPEN),
  closePlaybackWindows: () => ipcRenderer.invoke(IPC.PLAYBACK_CLOSE),
  getPlaybackSessionState: () => ipcRenderer.invoke(IPC.PLAYBACK_STATE),

  // Backend
  fetchRelease: () => ipcRenderer.invoke(IPC.BACKEND_FETCH_RELEASE),
  fetchManifest: (releaseId) =>
    ipcRenderer.invoke(IPC.BACKEND_FETCH_MANIFEST, releaseId),
  downloadContent: (url, assetId, contentType) =>
    ipcRenderer.invoke(IPC.BACKEND_DOWNLOAD_CONTENT, url, assetId, contentType),
  getCachedContentPath: (assetId, contentType, url) =>
    ipcRenderer.invoke(IPC.BACKEND_GET_CACHED_CONTENT, assetId, contentType, url),
  sendTelemetry: (payload) =>
    ipcRenderer.invoke(IPC.BACKEND_SEND_TELEMETRY, payload),
  revalidateDevice: () => ipcRenderer.invoke(IPC.BACKEND_REVALIDATE_DEVICE),
  fetchDeviceInfo: () => ipcRenderer.invoke(IPC.BACKEND_FETCH_DEVICE_INFO),
  getHealthStatus: () => ipcRenderer.invoke(IPC.HEALTH_GET_STATUS),

  // Connection
  getConnectionStatus: () => ipcRenderer.invoke(IPC.CONNECTION_STATUS),
  connectMqtt: (config) => ipcRenderer.invoke(IPC.MQTT_CONNECT, config),
  disconnectMqtt: () => ipcRenderer.invoke(IPC.MQTT_DISCONNECT),

  // Window
  getWindowMode: () => ipcRenderer.invoke(IPC.WINDOW_GET_MODE),
  getPlaybackDisplayId: () => ipcRenderer.invoke(IPC.WINDOW_GET_DISPLAY_ID),

  // App
  getAppVersion: () => ipcRenderer.invoke(IPC.APP_VERSION),
  getAppPlatform: () => ipcRenderer.invoke(IPC.APP_PLATFORM),
  quit: () => ipcRenderer.invoke(IPC.APP_QUIT),

  // Settings
  getExitShortcut: () => ipcRenderer.invoke(IPC.SETTINGS_GET_SHORTCUT),
  setExitShortcut: (accelerator) => ipcRenderer.invoke(IPC.SETTINGS_SET_SHORTCUT, accelerator),
  validateShortcut: (accelerator) => ipcRenderer.invoke(IPC.SETTINGS_VALIDATE_SHORTCUT, accelerator),
  getAutoLaunchSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET_AUTOLAUNCH),
  setAutoLaunchEnabled: (enabled) => ipcRenderer.invoke(IPC.SETTINGS_SET_AUTOLAUNCH, enabled),
  getCacheInfo: () => ipcRenderer.invoke(IPC.SETTINGS_GET_CACHE_INFO),
  clearCache: () => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_CACHE),
  startupMark: (stage, details) => ipcRenderer.send(IPC.STARTUP_TRACE, { stage, details }),

  // Events — return cleanup function
  onDisplaysChanged: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, displays: DisplayInfo[]) =>
      cb(displays)
    ipcRenderer.on(IPC.DISPLAYS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.DISPLAYS_CHANGED, handler)
  },

  onConnectionStatusChanged: (cb) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      status: ConnectionStatus
    ) => cb(status)
    ipcRenderer.on(IPC.CONNECTION_STATUS_CHANGED, handler)
    return () =>
      ipcRenderer.removeListener(IPC.CONNECTION_STATUS_CHANGED, handler)
  },

  onNewRelease: (cb) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      notification: ReleaseNotification
    ) => cb(notification)
    ipcRenderer.on(IPC.NEW_RELEASE, handler)
    return () => ipcRenderer.removeListener(IPC.NEW_RELEASE, handler)
  },

  onPlaybackScheduleUpdate: (cb) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      manifest: ReleaseManifest
    ) => cb(manifest)
    ipcRenderer.on(IPC.PLAYBACK_SCHEDULE_UPDATE, handler)
    return () =>
      ipcRenderer.removeListener(IPC.PLAYBACK_SCHEDULE_UPDATE, handler)
  },

  onActivationInvalidated: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, reason: string) => cb(reason)
    ipcRenderer.on(IPC.ACTIVATION_INVALIDATED, handler)
    return () => ipcRenderer.removeListener(IPC.ACTIVATION_INVALIDATED, handler)
  },
}

ipcRenderer.send(IPC.STARTUP_TRACE, {
  stage: 'preload:script-evaluated',
  timestamp: Date.now(),
})
process.nextTick(() => {
  ipcRenderer.send(IPC.STARTUP_TRACE, {
    stage: 'preload:next-tick',
    timestamp: Date.now(),
  })
})

contextBridge.exposeInMainWorld('electronAPI', api)
