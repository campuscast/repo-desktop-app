import { app, BrowserWindow, Menu, globalShortcut } from 'electron'
import { createControlWindow } from './windows'
import { initDisplayManager } from './display-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { persistence } from './services/persistence'
import { heartbeatService } from './services/heartbeat'
import { mqttService } from './services/mqtt-client'
import { backendClient } from './services/backend-client'

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.whenReady().then(async () => {
  // Initialize persistence (load config from disk)
  await persistence.init()

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
