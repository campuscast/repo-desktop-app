/** All IPC channel names — single source of truth for main + preload + renderer */
export const IPC = {
  // Persistence
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',

  // Activation
  ACTIVATION_REQUEST_CODE: 'activation:request-code',
  ACTIVATION_POLL_CREDENTIALS: 'activation:poll-credentials',

  // Display management
  DISPLAYS_GET: 'displays:get',
  DISPLAYS_GET_SELECTED: 'displays:get-selected',
  DISPLAYS_SET_SELECTED: 'displays:set-selected',
  DISPLAYS_CHANGED: 'displays:changed',

  // Playback windows
  PLAYBACK_OPEN: 'playback:open',
  PLAYBACK_CLOSE: 'playback:close',
  PLAYBACK_STATE: 'playback:state',
  PLAYBACK_STATE_CHANGED: 'playback:state-changed',
  PLAYBACK_SCHEDULE_UPDATE: 'playback:schedule-update',

  // Backend communication
  BACKEND_FETCH_RELEASE: 'backend:fetch-release',
  BACKEND_FETCH_MANIFEST: 'backend:fetch-manifest',
  BACKEND_DOWNLOAD_CONTENT: 'backend:download-content',
  BACKEND_GET_CACHED_CONTENT: 'backend:get-cached-content',
  BACKEND_SEND_TELEMETRY: 'backend:send-telemetry',
  BACKEND_REVALIDATE_DEVICE: 'backend:revalidate-device',
  BACKEND_FETCH_DEVICE_INFO: 'backend:fetch-device-info',
  HEALTH_GET_STATUS: 'health:get-status',

  // Connection / MQTT
  CONNECTION_STATUS: 'connection:status',
  CONNECTION_STATUS_CHANGED: 'connection:status-changed',
  MQTT_CONNECT: 'mqtt:connect',
  MQTT_DISCONNECT: 'mqtt:disconnect',
  NEW_RELEASE: 'mqtt:new-release',

  // Window mode
  WINDOW_GET_MODE: 'window:get-mode',
  WINDOW_GET_DISPLAY_ID: 'window:get-display-id',
  WINDOW_MINIMIZE_TO_TRAY: 'window:minimize-to-tray',

  // App lifecycle
  APP_QUIT: 'app:quit',
  APP_VERSION: 'app:version',
  APP_PLATFORM: 'app:platform',

  // Settings
  SETTINGS_GET_SHORTCUT: 'settings:get-shortcut',
  SETTINGS_SET_SHORTCUT: 'settings:set-shortcut',
  SETTINGS_VALIDATE_SHORTCUT: 'settings:validate-shortcut',
  SETTINGS_GET_AUTOLAUNCH: 'settings:get-autolaunch',
  SETTINGS_SET_AUTOLAUNCH: 'settings:set-autolaunch',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
