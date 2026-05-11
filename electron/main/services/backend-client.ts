import { net } from 'electron'
import type {
  ActivationCodeResponse,
  DeviceCredentials,
  DeviceInfo,
  Release,
  ReleaseManifest,
  TelemetryPayload,
} from '../../shared/ipc-types'

const DEFAULT_HTTP_TIMEOUT_MS = 12_000

export class BackendHttpError extends Error {
  constructor(
    public readonly statusCode: number | null,
    public readonly responseBody: string
  ) {
    super(
      `HTTP ${statusCode ?? 'unknown'}: ${responseBody.slice(0, 200)}`
    )
    this.name = 'BackendHttpError'
  }
}

export function isBackendHttpErrorWithStatus(
  error: unknown,
  statuses: number[]
): error is BackendHttpError {
  return (
    error instanceof BackendHttpError
    && error.statusCode !== null
    && statuses.includes(error.statusCode)
  )
}

export type ActivatedDeviceVerificationResult =
  | { status: 'exists'; info: DeviceInfo }
  | { status: 'missing' }
  | { status: 'unknown' }

/** Performs HTTP requests to CMS backend from the main process using Electron's net module */
class BackendClient {
  private withCacheBust(url: string): string {
    const parsed = new URL(url)
    parsed.searchParams.set('_ts', Date.now().toString())
    return parsed.toString()
  }

  /** POST /enrollment/request-code — unauthenticated */
  async requestActivationCode(
    apiBaseUrl: string,
    deviceId: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<ActivationCodeResponse> {
    return this.post<ActivationCodeResponse>(
      `${apiBaseUrl}/enrollment/request-code`,
      { device_id: deviceId },
      undefined,
      timeoutMs
    )
  }

  /** GET /enrollment/credentials?device_id=X&code=Y — unauthenticated */
  async pollCredentials(
    apiBaseUrl: string,
    deviceId: string,
    code: string
  ): Promise<DeviceCredentials | null> {
    try {
      return await this.get<DeviceCredentials>(
        `${apiBaseUrl}/enrollment/credentials?device_id=${encodeURIComponent(deviceId)}&code=${encodeURIComponent(code)}`
      )
    } catch {
      // 404 or error means not yet activated
      return null
    }
  }

  /**
   * Verifies that a device_id still exists in CMS.
   * Uses enrollment/request-code as an existence probe:
   * - 200: device exists (pending)
   * - 409: device exists (already activated/non-pending)
   * - 404: device does not exist
   * - other/network errors: unknown
   */
  async checkDeviceExists(
    apiBaseUrl: string,
    deviceId: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<'exists' | 'missing' | 'unknown'> {
    try {
      await this.requestActivationCode(apiBaseUrl, deviceId, timeoutMs)
      return 'exists'
    } catch (err) {
      if (err instanceof BackendHttpError) {
        if (err.statusCode === 404) return 'missing'
        if (err.statusCode === 409) return 'exists'
      }
      return 'unknown'
    }
  }

  /** GET /player/device-info?device_id=X — authenticated */
  async fetchDeviceInfo(
    apiBaseUrl: string,
    deviceToken: string,
    deviceId: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<DeviceInfo> {
    return this.get<DeviceInfo>(
      this.withCacheBust(
        `${apiBaseUrl}/player/device-info?device_id=${encodeURIComponent(deviceId)}`
      ),
      deviceToken,
      timeoutMs
    )
  }

  /**
   * Verifies active device session with authenticated /player/device-info.
   * - exists: authenticated device is still valid and info is returned
   * - missing: token/device pair is no longer valid in CMS (401/403/404/410)
   * - unknown: transient/network/backend errors
   */
  async verifyActivatedDevice(
    apiBaseUrl: string,
    deviceToken: string,
    deviceId: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<ActivatedDeviceVerificationResult> {
    try {
      const info = await this.fetchDeviceInfo(
        apiBaseUrl,
        deviceToken,
        deviceId,
        timeoutMs
      )
      return { status: 'exists', info }
    } catch (err) {
      if (err instanceof BackendHttpError) {
        if (
          err.statusCode === 401
          || err.statusCode === 403
          || err.statusCode === 404
          || err.statusCode === 410
        ) {
          return { status: 'missing' }
        }
      }
      return { status: 'unknown' }
    }
  }

  /** GET /player/release?device_id=X — authenticated */
  async fetchRelease(
    apiBaseUrl: string,
    deviceToken: string,
    deviceId: string
  ): Promise<Release | null> {
    try {
      return await this.get<Release>(
        this.withCacheBust(
          `${apiBaseUrl}/player/release?device_id=${encodeURIComponent(deviceId)}`
        ),
        deviceToken
      )
    } catch (err) {
      // 404 means "no active release yet", not a connectivity failure.
      if (err instanceof BackendHttpError && err.statusCode === 404) {
        return null
      }
      throw err
    }
  }

  /** GET /player/manifest/:releaseId — authenticated */
  async fetchManifest(
    apiBaseUrl: string,
    deviceToken: string,
    releaseId: string
  ): Promise<ReleaseManifest> {
    return this.get<ReleaseManifest>(
      this.withCacheBust(
        `${apiBaseUrl}/player/manifest/${encodeURIComponent(releaseId)}`
      ),
      deviceToken
    )
  }

  /** POST /player/telemetry — authenticated */
  async sendTelemetry(
    apiBaseUrl: string,
    deviceToken: string,
    payload: TelemetryPayload
  ): Promise<void> {
    await this.post(
      `${apiBaseUrl}/player/telemetry`,
      payload,
      deviceToken
    )
  }

  // ─── HTTP primitives ──────────────────────────────────────────────────

  private get<T>(
    url: string,
    token?: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const request = net.request({ method: 'GET', url, headers })
      const timeoutTimer = setTimeout(() => {
        request.abort()
        if (!settled) {
          settled = true
          reject(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
        }
      }, timeoutMs)

      const fail = (err: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        reject(err)
      }

      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            try {
              resolve(JSON.parse(body) as T)
            } catch {
              reject(new Error(`Invalid JSON response from ${url}`))
            }
          } else {
            reject(new BackendHttpError(response.statusCode ?? null, body))
          }
        })
        response.on('error', fail)
      })

      request.on('error', fail)
      request.end()
    })
  }

  private post<T = void>(
    url: string,
    data: unknown,
    token?: string,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const request = net.request({ method: 'POST', url, headers })
      const timeoutTimer = setTimeout(() => {
        request.abort()
        if (!settled) {
          settled = true
          reject(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
        }
      }, timeoutMs)

      const fail = (err: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        reject(err)
      }

      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          if (response.statusCode === 204) {
            resolve(undefined as T)
          } else if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            try {
              resolve(body ? (JSON.parse(body) as T) : (undefined as T))
            } catch {
              reject(new Error(`Invalid JSON response from ${url}`))
            }
          } else {
            reject(new BackendHttpError(response.statusCode ?? null, body))
          }
        })
        response.on('error', fail)
      })

      request.on('error', fail)
      request.write(JSON.stringify(data))
      request.end()
    })
  }
}

export const backendClient = new BackendClient()
