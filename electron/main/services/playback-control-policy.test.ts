import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decidePlaybackOpen,
  decidePlaybackClose,
} from './playback-control-policy.js'

describe('playback control policy', () => {
  it('prevents duplicate start while playback is already active', () => {
    const decision = decidePlaybackOpen(2)
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'already-running')
  })

  it('allows start from stopped state', () => {
    const decision = decidePlaybackOpen(0)
    assert.equal(decision.allowed, true)
    assert.equal(decision.reason, 'ok')
  })

  it('prevents duplicate stop while already stopped', () => {
    const decision = decidePlaybackClose(0)
    assert.equal(decision.allowed, false)
    assert.equal(decision.reason, 'already-stopped')
  })
})
