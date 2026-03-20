import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCacheStatusAfterManualClear } from './cache-cleanup-policy.js'
import type { ReleaseManifest } from '../../shared/ipc-types.js'

const NOW = '2026-03-20T12:00:00.000Z'

function makeManifest(): ReleaseManifest {
  return {
    release_id: 'release-1',
    schedule_id: 'schedule-1',
    version_number: 7,
    zone_id: 'zone-1',
    slots: [],
    assets: [],
    manifest_hash: 'hash-1',
    created_at: NOW,
  }
}

describe('cache cleanup policy', () => {
  it('preserves release context and marks cleanup timestamp', () => {
    const status = buildCacheStatusAfterManualClear(
      makeManifest(),
      { total: 12, available: 0, missing: 12 },
      NOW,
      0
    )

    assert.equal(status.current_release_id, 'release-1')
    assert.equal(status.total_assets, 12)
    assert.equal(status.available_assets, 0)
    assert.equal(status.missing_assets, 12)
    assert.equal(status.last_cleanup_at, NOW)
    assert.equal(status.last_error, null)
  })

  it('records partial deletion failures', () => {
    const status = buildCacheStatusAfterManualClear(
      null,
      { total: 0, available: 0, missing: 0 },
      NOW,
      3
    )

    assert.equal(status.current_release_id, null)
    assert.equal(status.last_error, 'Failed to delete 3 cached file(s)')
  })
})
