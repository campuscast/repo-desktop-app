import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideReleaseFetchPolicy } from './release-fetch-policy.js'

describe('release fetch policy', () => {
  it('treats no active release as a normal connected state', () => {
    const decision = decideReleaseFetchPolicy({
      scenario: 'no-active-release',
    })

    assert.equal(decision.backendStatus, 'connected')
    assert.equal(decision.lastError, null)
    assert.equal(decision.shouldUseFallbackManifest, false)
  })

  it('marks network failures as disconnected and allows fallback', () => {
    const decision = decideReleaseFetchPolicy({
      scenario: 'network-error',
      errorMessage: 'connect ECONNREFUSED 127.0.0.1:3000',
    })

    assert.equal(decision.backendStatus, 'disconnected')
    assert.equal(
      decision.lastError,
      'connect ECONNREFUSED 127.0.0.1:3000'
    )
    assert.equal(decision.shouldUseFallbackManifest, true)
  })
})
