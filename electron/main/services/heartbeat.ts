import { desktopCapturer, net } from 'electron'
import type {
  AppConfig,
  HeartbeatStatus,
  TelemetryPayload,
} from '../../shared/ipc-types'
import { getDisplays } from '../display-manager'
import { persistence } from './persistence'
import { mqttService } from './mqtt-client'
import { isProvisioningInvalidationStatus } from './provisioning-invalidation-policy'
import { withErrorTimestamp } from '../../shared/error-log'

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

  private async capturePreviewPayload(): Promise<{
    image_base64?: string
    mime_type: string
    captured_at: string
    width?: number
    height?: number
    status: string
  }> {
    const capturedAt = new Date().toISOString()
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 640, height: 360 },
        fetchWindowIcons: false,
      })
      if (!sources.length) {
        return { mime_type: 'image/png', captured_at: capturedAt, status: 'no_screen_source' }
      }

      const preferredDisplayId = this.config?.selectedDisplayIds?.[0]
      const source = sources.find((item) => item.display_id === preferredDisplayId) || sources[0]
      const thumbnail = source.thumbnail
      if (thumbnail.isEmpty()) {
        return { mime_type: 'image/png', captured_at: capturedAt, status: 'empty_thumbnail' }
      }
      const size = thumbnail.getSize()
      return {
        image_base64: thumbnail.toDataURL(),
        mime_type: 'image/png',
        captured_at: capturedAt,
        width: size.width,
        height: size.height,
        status: 'ok',
      }
    } catch (error) {
      return {
        mime_type: 'image/png',
        captured_at: capturedAt,
        status: `capture_error:${error instanceof Error ? error.message : 'unknown'}`,
      }
    }
  }

  private async sendPreview(): Promise<void> {
    if (!this.config?.deviceToken || !this.config.deviceId) return
    const payload = await this.capturePreviewPayload()
    try {
      const request = net.request({
        method: 'POST',
        url: `${this.config.apiBaseUrl}/player/preview`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.deviceToken}`,
        },
      })

      await new Promise<void>((resolve, reject) => {
        request.on('response', (response) => {
          if ((response.statusCode || 500) < 300) {
            resolve()
            return
          }
          reject(new Error(`Preview upload failed: ${response.statusCode}`))
        })
        request.on('error', reject)
        request.write(JSON.stringify(payload))
        request.end()
      })
    } catch (error) {
      console.warn('[heartbeat] Failed to send preview:', error)
    }
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
    const rawLastError =
      connection.lastError ?? playbackState?.errors?.at(-1) ?? null
    const lastError = rawLastError
      ? withErrorTimestamp(rawLastError)
      : null

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
            this.status.last_error = withErrorTimestamp(reason)
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
      await this.sendPreview()
    } catch (err) {
      // Silent fail — heartbeat errors are non-critical
      this.status.last_error = withErrorTimestamp(
        err instanceof Error ? err.message : String(err)
      )
      console.warn('[heartbeat] Failed to send telemetry:', err)
    }
  }
}

export const heartbeatService = new HeartbeatService()
