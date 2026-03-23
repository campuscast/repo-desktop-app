import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveDesktopVideoAudioConfig } from './video-audio-policy.js'

describe('desktop video audio policy', () => {
  it('forces unmuted playback even when manifest requests mute', () => {
    const config = resolveDesktopVideoAudioConfig(
      { type: 'video_asset', video: { mute: true } },
      { video_mute: true }
    )

    assert.equal(config.muted, false)
    assert.equal(config.defaultMuted, false)
    assert.equal(config.volume, 1)
  })

  it('keeps explicit full-volume unmuted defaults', () => {
    const config = resolveDesktopVideoAudioConfig(
      { type: 'video_asset', video: { mute: false } },
      { video_mute: false }
    )

    assert.equal(config.muted, false)
    assert.equal(config.defaultMuted, false)
    assert.equal(config.volume, 1)
  })
})
