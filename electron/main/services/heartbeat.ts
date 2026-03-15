import { net } from 'electron'
import type { AppConfig, TelemetryPayload } from '../../shared/ipc-types'
import { getDisplays } from '../display-manager'
import { persistence } from './persistence'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null
  private config: AppConfig | null = null

  start(config: AppConfig): void {
    this.config = config
    this.stop()
    // Send initial heartbeat
    this.sendHeartbeat()
    this.timer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  updateConfig(config: AppConfig): void {
    this.config = config
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.config?.deviceToken || !this.config.deviceId) return

    const playbackState = persistence.getPlaybackState()
    const displays = getDisplays()

    const payload: TelemetryPayload = {
      device_id: this.config.deviceId,
      current_release_id: playbackState?.releaseId ?? null,
      playback_status: playbackState?.status ?? 'idle',
      current_slot_id: playbackState?.currentSlot?.slot_id ?? null,
      errors: playbackState?.errors ?? [],
      displays,
      selected_displays: this.config.selectedDisplayIds,
      timestamp: new Date().toISOString(),
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
      console.warn('[heartbeat] Failed to send telemetry:', err)
    }
  }
}

export const heartbeatService = new HeartbeatService()
