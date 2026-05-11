import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReleaseManifest } from '../../shared/ipc-types.js'
import { PREFETCH_LOOKAHEAD_MS, selectRelevantAssets } from './relevant-asset-policy.js'

function buildManifest(): ReleaseManifest {
  return {
    release_id: 'release-1',
    schedule_id: 'schedule-1',
    version_number: 1,
    zone_id: 'zone-1',
    manifest_hash: 'hash',
    created_at: '2026-03-31T00:00:00.000Z',
    slots: [
      {
        slot_id: 'past',
        asset_id: 'asset-past',
        start_time: '2026-03-31T09:00:00.000Z',
        end_time: '2026-03-31T09:30:00.000Z',
        priority: 1,
        zone_id: 'zone-1',
        group_id: 'group-1',
      },
      {
        slot_id: 'active',
        asset_id: 'asset-active',
        publication_id: 'publication-1',
        start_time: '2026-03-31T10:00:00.000Z',
        end_time: '2026-03-31T11:00:00.000Z',
        priority: 1,
        zone_id: 'zone-1',
        group_id: 'group-1',
      },
      {
        slot_id: 'near',
        asset_id: 'asset-near',
        start_time: '2026-03-31T10:03:00.000Z',
        end_time: '2026-03-31T10:30:00.000Z',
        priority: 1,
        zone_id: 'zone-1',
        group_id: 'group-1',
      },
      {
        slot_id: 'tomorrow',
        asset_id: 'asset-tomorrow',
        start_time: '2026-04-01T06:00:00.000Z',
        end_time: '2026-04-01T07:00:00.000Z',
        priority: 1,
        zone_id: 'zone-1',
        group_id: 'group-1',
      },
    ],
    assets: [
      {
        asset_id: 'asset-past',
        filename: 'past.mp4',
        content_type: 'video/mp4',
        file_size: 1,
        sha256_hash: 'a',
        download_url: 'https://example.test/past.mp4',
        metadata: {},
      },
      {
        asset_id: 'asset-active',
        filename: 'active.mp4',
        content_type: 'video/mp4',
        file_size: 1,
        sha256_hash: 'b',
        download_url: 'https://example.test/active.mp4',
        metadata: {},
      },
      {
        asset_id: 'asset-publication',
        filename: 'publication.mp4',
        content_type: 'video/mp4',
        file_size: 1,
        sha256_hash: 'c',
        download_url: 'https://example.test/publication.mp4',
        metadata: {},
      },
      {
        asset_id: 'asset-near',
        filename: 'near.mp4',
        content_type: 'video/mp4',
        file_size: 1,
        sha256_hash: 'd',
        download_url: 'https://example.test/near.mp4',
        metadata: {},
      },
      {
        asset_id: 'asset-tomorrow',
        filename: 'tomorrow.mp4',
        content_type: 'video/mp4',
        file_size: 1,
        sha256_hash: 'e',
        download_url: 'https://example.test/tomorrow.mp4',
        metadata: {},
      },
    ],
    publications: [
      {
        publication_id: 'publication-1',
        zone_id: 'zone-1',
        title: 'Publication',
        type: 'playlist',
        status: 'published',
        version: 1,
        items: [
          {
            item_id: 'item-1',
            type: 'video_asset',
            video: {
              asset_id: 'asset-publication',
            },
          },
        ],
      },
    ],
  }
}

describe('relevant asset policy', () => {
  it('keeps only active and near-term slots plus publication assets', () => {
    const selection = selectRelevantAssets(
      buildManifest(),
      new Date('2026-03-31T10:00:00.000Z'),
      PREFETCH_LOOKAHEAD_MS
    )

    assert.deepEqual(
      selection.slots.map((slot) => slot.slot_id),
      ['active', 'near']
    )
    assert.deepEqual(
      selection.assets.map((asset) => asset.asset_id),
      ['asset-active', 'asset-publication', 'asset-near']
    )
  })

  it('falls back to the nearest future slot when nothing is active in-window', () => {
    const selection = selectRelevantAssets(
      buildManifest(),
      new Date('2026-03-31T12:00:00.000Z'),
      PREFETCH_LOOKAHEAD_MS
    )

    assert.deepEqual(selection.slots.map((slot) => slot.slot_id), ['tomorrow'])
    assert.deepEqual(
      selection.assets.map((asset) => asset.asset_id),
      ['asset-tomorrow']
    )
  })
})
