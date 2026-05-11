import { desktopCapturer, net } from 'electron'
import type {
  AppConfig,
  HeartbeatStatus,
  PreviewUploadPayload,
  ScreenshotRequestCommand,
  TelemetryPayload,
  TelemetryResponse,
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

  private async capturePreviewPayload(
    displayId?: string | null,
    requestId?: string | null
  ): Promise<PreviewUploadPayload> {
    const capturedAt = new Date().toISOString()
    const knownDisplays = getDisplays()
    const requestedDisplay = displayId
      ? knownDisplays.find((display) => display.id === displayId) ?? null
      : null
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
        return {
          mime_type: 'image/png',
          captured_at: capturedAt,
          status: 'no_screen_source',
          display_id: displayId ?? null,
          display_label: requestedDisplay?.label ?? null,
          request_id: requestId ?? null,
        }
      }

      const requestedByCommand = Boolean(displayId)
      const preferredDisplayId = displayId ?? this.config?.selectedDisplayIds?.[0]
      const source = preferredDisplayId
        ? sources.find((item) => item.display_id === preferredDisplayId)
          ?? (requestedByCommand ? null : sources[0])
        : sources[0]
      if (requestedByCommand && preferredDisplayId && !source) {
        return {
          mime_type: 'image/png',
          captured_at: capturedAt,
          status: `display_not_found:${preferredDisplayId}`,
          display_id: preferredDisplayId,
          display_label: requestedDisplay?.label ?? null,
          request_id: requestId ?? null,
        }
      }

      const resolvedSource = source ?? sources[0]
      const thumbnail = resolvedSource.thumbnail
      if (thumbnail.isEmpty()) {
        return {
          mime_type: 'image/png',
          captured_at: capturedAt,
          status: 'empty_thumbnail',
          display_id: resolvedSource.display_id || preferredDisplayId || null,
          display_label: requestedDisplay?.label ?? resolvedSource.name ?? null,
          request_id: requestId ?? null,
        }
      }
      const size = thumbnail.getSize()
      const resolvedDisplayId = resolvedSource.display_id || preferredDisplayId || null
      const resolvedDisplayLabel = knownDisplays.find((display) => display.id === resolvedDisplayId)?.label
        ?? requestedDisplay?.label
        ?? resolvedSource.name
        ?? null

      return {
        image_base64: thumbnail.toDataURL(),
        mime_type: 'image/png',
        captured_at: capturedAt,
        width: size.width,
        height: size.height,
        status: 'ok',
        display_id: resolvedDisplayId,
        display_label: resolvedDisplayLabel,
        request_id: requestId ?? null,
      }
    } catch (error) {
      return {
        mime_type: 'image/png',
        captured_at: capturedAt,
        status: `capture_error:${error instanceof Error ? error.message : 'unknown'}`,
        display_id: displayId ?? null,
        display_label: requestedDisplay?.label ?? null,
        request_id: requestId ?? null,
      }
    }
  }

  private async postJson<T>(
    url: string,
    payload: unknown,
    timeoutMs: number
  ): Promise<{ statusCode: number | null; body: T | null }> {
    if (!this.config?.deviceToken) {
      throw new Error('Not authenticated')
    }

    return new Promise<{ statusCode: number | null; body: T | null }>((resolve, reject) => {
      let settled = false
      let responseBody = ''
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
        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString()
        })
        response.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          let parsedBody: T | null = null
          if (responseBody.trim()) {
            try {
              parsedBody = JSON.parse(responseBody) as T
            } catch {
              parsedBody = null
            }
          }
          resolve({ statusCode: response.statusCode ?? null, body: parsedBody })
        })
        response.on('error', fail)
      })

      request.on('error', fail)
      request.write(JSON.stringify(payload))
      request.end()
    })
  }

  private async sendPreview(request?: ScreenshotRequestCommand | null): Promise<void> {
    if (!this.config?.deviceToken || !this.config.deviceId) return
    const payload = await this.capturePreviewPayload(
      request?.display_id ?? null,
      request?.request_id ?? null
    )
    try {
      const { statusCode } = await this.postJson(
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

  triggerNow(): void {
    void this.sendHeartbeat()
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
      current_publication_id: playbackState?.currentPublication?.publication_id ?? null,
      current_publication_title: playbackState?.currentPublication?.title ?? null,
      current_publication_item_id: playbackState?.currentPublicationItem?.item_id ?? null,
      current_publication_item_title: playbackState?.currentPublicationItem?.title ?? null,
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
      const { statusCode, body } = await this.postJson<TelemetryResponse>(
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
      await this.sendPreview(body?.screenshot_request ?? null)
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
