import type { CacheStatus, ReleaseManifest } from '../../shared/ipc-types'
import { withErrorTimestamp } from '../../shared/error-log'

interface VerifiedAssetStats {
  total: number
  available: number
  missing: number
}

export function buildCacheStatusAfterManualClear(
  manifest: ReleaseManifest | null,
  verified: VerifiedAssetStats,
  nowIso: string,
  failedDeletes: number
): Partial<CacheStatus> {
  return {
    current_release_id: manifest?.release_id ?? null,
    total_assets: verified.total,
    available_assets: verified.available,
    missing_assets: verified.missing,
    last_cleanup_at: nowIso,
    last_error:
      failedDeletes > 0
        ? withErrorTimestamp(
          `Failed to delete ${failedDeletes} cached file(s)`,
          new Date(nowIso)
        )
        : null,
  }
}
