import { net } from 'electron'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { extname } from 'path'
import { persistence } from './persistence'

class ContentCacheService {
  /** Download a content file to local cache. Returns local file path. */
  async download(
    url: string,
    assetId: string,
    deviceToken: string
  ): Promise<string> {
    const ext = extname(new URL(url).pathname) || '.bin'
    const localPath = persistence.getContentFilePath(assetId, ext)

    // Skip if already cached
    if (existsSync(localPath)) {
      return localPath
    }

    return new Promise<string>((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url,
        headers: {
          Authorization: `Bearer ${deviceToken}`,
        },
      })

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Download failed: HTTP ${response.statusCode} for ${url}`)
          )
          return
        }

        const fileStream = createWriteStream(localPath)

        response.on('data', (chunk: Buffer) => {
          fileStream.write(chunk)
        })

        response.on('end', () => {
          fileStream.end()
          resolve(localPath)
        })

        response.on('error', (err) => {
          fileStream.destroy()
          // Clean up partial file
          if (existsSync(localPath)) {
            try {
              unlinkSync(localPath)
            } catch {
              // ignore
            }
          }
          reject(err)
        })
      })

      request.on('error', (err) => {
        reject(err)
      })

      request.end()
    })
  }

  /** Get the local file path for a cached asset (or null) */
  getLocalPath(assetId: string, contentType: string): string | null {
    const ext = this.mimeToExt(contentType)
    const path = persistence.getContentFilePath(assetId, ext)
    return existsSync(path) ? path : null
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'text/html': '.html',
      'application/pdf': '.pdf',
    }
    return map[mime] ?? '.bin'
  }
}

export const contentCacheService = new ContentCacheService()
