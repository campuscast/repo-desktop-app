import { net } from 'electron'
import type {
  AppConfig,
  HeartbeatStatus,
  TelemetryPayload,
} from '../../shared/ipc-types'
import { getDisplays } from '../display-manager'
import { persistence } from './persistence'
import { mqttService } from './mqtt-client'
import { isProvisioningInvalidationStatus } from './provisioning-invalidation-policy'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null
  private config: AppConfig | null = null
  private provisioningInvalidationHandler: ((reason: string) => void) | null = null
  private status: HeartbeatStatus = {
    running: false,
    interval_ms: HEARTBEAT_INTERVAL_MS,
    last_attempt_at: null,
    last_success_at: null,
    last_error: null,
  }

  start(config: AppConfig): void {
    this.config = config
    this.stop()
    this.status.running = true
    this.status.last_error = null
    // Send initial heartbeat
    this.sendHeartbeat()
    this.timer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.status.running = false
  }

  updateConfig(config: AppConfig): void {
    this.config = config
  }

  setProvisioningInvalidationHandler(
    handler: ((reason: string) => void) | null
  ): void {
    this.provisioningInvalidationHandler = handler
  }

  getStatus(): HeartbeatStatus {
    return { ...this.status }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.config?.deviceToken || !this.config.deviceId) return
    this.status.last_attempt_at = new Date().toISOString()

    const playbackState = persistence.getPlaybackState()
    const displays = getDisplays()
    const connection = mqttService.getStatus()
    const cache = persistence.getCacheStatus()
    const online =
      connection.backend === 'connected' || connection.mqtt === 'connected'
    const lastError = connection.lastError ?? playbackState?.errors?.at(-1) ?? null

    const payload: TelemetryPayload = {
      device_id: this.config.deviceId,
      current_release_id: playbackState?.releaseId ?? null,
      playback_status: playbackState?.status ?? 'idle',
      current_slot_id: playbackState?.currentSlot?.slot_id ?? null,
      errors: playbackState?.errors ?? [],
      displays,
      selected_displays: this.config.selectedDisplayIds,
      timestamp: new Date().toISOString(),
      online,
      backend_status: connection.backend,
      mqtt_status: connection.mqtt,
      cache,
      last_error: lastError,
    }

    try {
      const request = net.request({
        method: 'POST',
        url: `${this.config.apiBaseUrl}/player/telemetry`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.deviceToken}`,
        },
      })

      await new Promise<void>((resolve, reject) => {
        request.on('response', (response) => {
          if (response.statusCode === 204 || response.statusCode === 200) {
            this.status.last_success_at = new Date().toISOString()
            this.status.last_error = null
            resolve()
          } else if (
            isProvisioningInvalidationStatus(
              response.statusCode ?? null,
              'heartbeat'
            )
          ) {
            const reason = `Device provisioning invalidated (heartbeat status ${response.statusCode})`
            this.status.last_error = reason
            this.provisioningInvalidationHandler?.(reason)
            resolve()
          } else {
            reject(new Error(`Telemetry failed: ${response.statusCode}`))
          }
        })
        request.on('error', reject)
        request.write(JSON.stringify(payload))
        request.end()
      })
    } catch (err) {
      // Silent fail — heartbeat errors are non-critical
      this.status.last_error = err instanceof Error ? err.message : String(err)
      console.warn('[heartbeat] Failed to send telemetry:', err)
    }
  }
}

export const heartbeatService = new HeartbeatService()
