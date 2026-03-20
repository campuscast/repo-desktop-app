import { net } from 'electron'
import {
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs'
import { basename, extname, join } from 'path'
import { persistence } from './persistence.js'
import type {
  CacheClearResult,
  CacheInfo,
  ReleaseManifest,
} from '../../shared/ipc-types'

class ContentCacheService {
  private resolveLocalPath(
    assetId: string,
    url: string,
    contentType?: string
  ): string {
    const ext = contentType
      ? this.mimeToExt(contentType)
      : extname(new URL(url).pathname) || '.bin'
    return persistence.getContentFilePath(assetId, ext)
  }

  /** Download a content file to local cache. Returns local file path. */
  async download(
    url: string,
    assetId: string,
    deviceToken: string,
    contentType?: string
  ): Promise<string> {
    const localPath = this.resolveLocalPath(assetId, url, contentType)

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

  async prefetchManifestAssets(
    manifest: ReleaseManifest,
    deviceToken: string
  ): Promise<{
    total: number
    available: number
    downloaded: number
    failed: string[]
  }> {
    let available = 0
    let downloaded = 0
    const failed: string[] = []

    for (const asset of manifest.assets) {
      const localPath = this.resolveLocalPath(
        asset.asset_id,
        asset.download_url,
        asset.content_type
      )
      if (existsSync(localPath)) {
        available += 1
        continue
      }

      try {
        await this.download(
          asset.download_url,
          asset.asset_id,
          deviceToken,
          asset.content_type
        )
        available += 1
        downloaded += 1
      } catch (err) {
        failed.push(
          `${asset.asset_id}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    return {
      total: manifest.assets.length,
      available,
      downloaded,
      failed,
    }
  }

  verifyManifestAssets(manifest: ReleaseManifest): {
    total: number
    available: number
    missing: number
    missingAssetIds: string[]
  } {
    const missingAssetIds: string[] = []
    let available = 0

    for (const asset of manifest.assets) {
      const localPath = this.resolveLocalPath(
        asset.asset_id,
        asset.download_url,
        asset.content_type
      )
      if (existsSync(localPath)) {
        available += 1
      } else {
        missingAssetIds.push(asset.asset_id)
      }
    }

    return {
      total: manifest.assets.length,
      available,
      missing: manifest.assets.length - available,
      missingAssetIds,
    }
  }

  cleanupUnusedAssets(manifest: ReleaseManifest): number {
    const keepFiles = new Set(
      manifest.assets.map((asset) =>
        basename(this.resolveLocalPath(
          asset.asset_id,
          asset.download_url,
          asset.content_type
        ))
      )
    )

    const contentDir = persistence.getContentDir()
    const files = readdirSync(contentDir, { withFileTypes: true })
    let removed = 0

    for (const entry of files) {
      if (!entry.isFile()) continue
      if (keepFiles.has(entry.name)) continue

      const filePath = join(contentDir, entry.name)
      try {
        unlinkSync(filePath)
        removed += 1
      } catch (err) {
        console.warn('[content-cache] Failed to cleanup file:', filePath, err)
      }
    }

    return removed
  }

  /** Get the local file path for a cached asset (or null) */
  getLocalPath(assetId: string, contentType: string, url = ''): string | null {
    const path = this.resolveLocalPath(assetId, url || `https://cache/${assetId}`, contentType)
    return existsSync(path) ? path : null
  }

  getCacheInfo(): CacheInfo {
    const contentDir = persistence.getContentDir()
    const files = readdirSync(contentDir, { withFileTypes: true })
    let mediaFiles = 0
    let totalBytes = 0

    for (const entry of files) {
      if (!entry.isFile()) continue
      mediaFiles += 1
      const fullPath = join(contentDir, entry.name)
      try {
        totalBytes += statSync(fullPath).size
      } catch {
        // Ignore per-file stat failures and continue.
      }
    }

    return {
      content_dir: contentDir,
      media_files: mediaFiles,
      total_bytes: totalBytes,
    }
  }

  clearMediaCache(): Omit<CacheClearResult, 'browser_cache_cleared'> {
    const contentDir = persistence.getContentDir()
    const files = readdirSync(contentDir, { withFileTypes: true })
    let mediaFilesRemoved = 0
    let mediaFilesFailed = 0
    let bytesReclaimed = 0

    for (const entry of files) {
      if (!entry.isFile()) continue
      const fullPath = join(contentDir, entry.name)
      let size = 0
      try {
        size = statSync(fullPath).size
      } catch {
        size = 0
      }

      try {
        unlinkSync(fullPath)
        mediaFilesRemoved += 1
        bytesReclaimed += size
      } catch (err) {
        mediaFilesFailed += 1
        console.warn('[content-cache] Failed to delete cache file:', fullPath, err)
      }
    }

    return {
      media_files_removed: mediaFilesRemoved,
      media_files_failed: mediaFilesFailed,
      bytes_reclaimed: bytesReclaimed,
    }
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
