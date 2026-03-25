import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decidePlaybackClose,
  decidePlaybackOpen,
} from '../electron/main/services/playback-control-policy.ts'

describe('playback control policy runtime behavior', () => {
  it('blocks duplicate start when playback windows already exist', () => {
    const decision = decidePlaybackOpen(2, false)
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'already-running')
  })

  it('blocks duplicate start when playback recovery intent is still active', () => {
    const decision = decidePlaybackOpen(0, true)
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'already-running')
  })

  it('allows stop to clear an orphaned playback intent', () => {
    const decision = decidePlaybackClose(0, true)
    assert.equal(decision.allowed, true)
    assert.equal(decision.reason, 'ok')
  })
})
