import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
  MqttConfig,
  ConnectionStatus,
  ReleaseNotification,
} from '../../shared/ipc-types'

class MqttService {
  private client: MqttClient | null = null
  private config: MqttConfig | null = null
  private status: ConnectionStatus = {
    backend: 'disconnected',
    mqtt: 'disconnected',
    lastError: null,
  }

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  setBackendStatus(
    status: ConnectionStatus['backend'],
    lastError?: string | null
  ): void {
    const partial: Partial<ConnectionStatus> = { backend: status }
    if (lastError !== undefined) {
      partial.lastError = lastError
    }
    this.updateStatus(partial)
  }

  async connect(config: MqttConfig): Promise<void> {
    this.disconnect()
    this.config = config

    this.updateStatus({ mqtt: 'connecting' })

    try {
      this.client = mqtt.connect(config.brokerUrl, {
        clientId: config.clientId,
        username: config.clientId,
        password: config.deviceToken,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      })

      this.client.on('connect', () => {
        this.updateStatus({ mqtt: 'connected', lastError: null })
        this.subscribe()
      })

      this.client.on('reconnect', () => {
        this.updateStatus({ mqtt: 'connecting' })
      })

      this.client.on('error', (err) => {
        this.updateStatus({
          mqtt: 'disconnected',
          lastError: err.message,
        })
      })

      this.client.on('close', () => {
        this.updateStatus({ mqtt: 'disconnected' })
      })

      this.client.on('message', (_topic: string, payload: Buffer) => {
        this.handleMessage(_topic, payload)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown MQTT error'
      this.updateStatus({ mqtt: 'disconnected', lastError: msg })
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.removeAllListeners()
      this.client.end(true)
      this.client = null
    }
    this.updateStatus({ mqtt: 'disconnected' })
  }

  private subscribe(): void {
    if (!this.client || !this.config) return

    const { topicPrefix } = this.config
    const topics = [
      `${topicPrefix}/releases`,
      `${topicPrefix}/updates`,
    ]

    this.client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        console.error('[mqtt] Subscribe error:', err)
      }
    })
  }

  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const data = JSON.parse(payload.toString())

      if (topic.endsWith('/releases')) {
        const notification: ReleaseNotification = {
          release_id: data.release_id,
          manifest_hash: data.manifest_hash,
          published_at: data.published_at,
        }
        this.broadcastToAll(IPC.NEW_RELEASE, notification)
      }
    } catch (err) {
      console.warn('[mqtt] Failed to parse message:', err)
    }
  }

  private updateStatus(partial: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...partial }
    this.broadcastToAll(IPC.CONNECTION_STATUS_CHANGED, this.status)
  }

  private broadcastToAll(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }
}

export const mqttService = new MqttService()
