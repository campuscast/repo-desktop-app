import { net } from 'electron'
import type {
  ActivationCodeResponse,
  DeviceCredentials,
  DeviceInfo,
  Release,
  ReleaseManifest,
  TelemetryPayload,
} from '../../shared/ipc-types'

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

/** Performs HTTP requests to CMS backend from the main process using Electron's net module */
class BackendClient {
  /** POST /enrollment/request-code — unauthenticated */
  async requestActivationCode(
    apiBaseUrl: string,
    deviceId: string
  ): Promise<ActivationCodeResponse> {
    return this.post<ActivationCodeResponse>(
      `${apiBaseUrl}/enrollment/request-code`,
      { device_id: deviceId }
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
    deviceId: string
  ): Promise<'exists' | 'missing' | 'unknown'> {
    try {
      await this.requestActivationCode(apiBaseUrl, deviceId)
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
    deviceId: string
  ): Promise<DeviceInfo> {
    return this.get<DeviceInfo>(
      `${apiBaseUrl}/player/device-info?device_id=${encodeURIComponent(deviceId)}`,
      deviceToken
    )
  }

  /** GET /player/release?device_id=X — authenticated */
  async fetchRelease(
    apiBaseUrl: string,
    deviceToken: string,
    deviceId: string
  ): Promise<Release | null> {
    try {
      return await this.get<Release>(
        `${apiBaseUrl}/player/release?device_id=${encodeURIComponent(deviceId)}`,
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
      `${apiBaseUrl}/player/manifest/${encodeURIComponent(releaseId)}`,
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

  private get<T>(url: string, token?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const request = net.request({ method: 'GET', url, headers })

      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
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
        response.on('error', reject)
      })

      request.on('error', reject)
      request.end()
    })
  }

  private post<T = void>(
    url: string,
    data: unknown,
    token?: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const request = net.request({ method: 'POST', url, headers })

      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
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
        response.on('error', reject)
      })

      request.on('error', reject)
      request.write(JSON.stringify(data))
      request.end()
    })
  }
}

export const backendClient = new BackendClient()
