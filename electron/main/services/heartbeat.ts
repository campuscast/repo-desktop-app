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
const HEARTBEAT_REQUEST_TIMEOUT_MS = 10_000
const PREVIEW_CAPTURE_TIMEOUT_MS = 4_000

class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null
  private config: AppConfig | null = null
  private provisioningInvalidationHandler: ((reason: string) => void) | null = null
  private inFlight = false
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
      const sources = await Promise.race([
        desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 640, height: 360 },
          fetchWindowIcons: false,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('desktop capture timed out'))
          }, PREVIEW_CAPTURE_TIMEOUT_MS)
        }),
      ])
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

  private async postJson(
    url: string,
    payload: unknown,
    timeoutMs: number
  ): Promise<number | null> {
    if (!this.config?.deviceToken) {
      throw new Error('Not authenticated')
    }

    return new Promise<number | null>((resolve, reject) => {
      let settled = false
      const request = net.request({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config?.deviceToken}`,
        },
      })

      const timeoutTimer = setTimeout(() => {
        request.abort()
        if (!settled) {
          settled = true
          reject(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
        }
      }, timeoutMs)

      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        reject(error)
      }

      request.on('response', (response) => {
        response.on('data', () => {
          // Drain the response stream to let Electron complete cleanly.
        })
        response.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          resolve(response.statusCode ?? null)
        })
        response.on('error', fail)
      })

      request.on('error', fail)
      request.write(JSON.stringify(payload))
      request.end()
    })
  }

  private async sendPreview(): Promise<void> {
    if (!this.config?.deviceToken || !this.config.deviceId) return
    const payload = await this.capturePreviewPayload()
    try {
      const statusCode = await this.postJson(
        `${this.config.apiBaseUrl}/player/preview`,
        payload,
        HEARTBEAT_REQUEST_TIMEOUT_MS
      )
      if ((statusCode || 500) >= 300) {
        throw new Error(`Preview upload failed: ${statusCode}`)
      }
    } catch (error) {
      console.warn('[heartbeat] Failed to send preview:', error)
    }
  }

  start(config: AppConfig): void {
    this.config = config
    this.stop()
    this.inFlight = false
    this.status.running = true
    this.status.last_error = null
    // Send initial heartbeat
    void this.sendHeartbeat()
    this.timer = setInterval(() => {
      void this.sendHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.inFlight = false
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
    if (this.inFlight) {
      console.info('[heartbeat] Skipping overlapping heartbeat cycle')
      return
    }

    this.inFlight = true
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
      const statusCode = await this.postJson(
        `${this.config.apiBaseUrl}/player/telemetry`,
        payload,
        HEARTBEAT_REQUEST_TIMEOUT_MS
      )
      if (statusCode === 204 || statusCode === 200) {
        this.status.last_success_at = new Date().toISOString()
        this.status.last_error = null
      } else if (
        isProvisioningInvalidationStatus(
          statusCode ?? null,
          'heartbeat'
        )
      ) {
        const reason = `Device provisioning invalidated (heartbeat status ${statusCode})`
        this.status.last_error = withErrorTimestamp(reason)
        this.provisioningInvalidationHandler?.(reason)
      } else {
        throw new Error(`Telemetry failed: ${statusCode}`)
      }
      await this.sendPreview()
    } catch (err) {
      // Silent fail — heartbeat errors are non-critical
      this.status.last_error = withErrorTimestamp(
        err instanceof Error ? err.message : String(err)
      )
      console.warn('[heartbeat] Failed to send telemetry:', err)
    } finally {
      this.inFlight = false
    }
  }
}

export const heartbeatService = new HeartbeatService()
