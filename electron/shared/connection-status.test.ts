import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveEffectiveConnection,
  isEffectivelyDisconnected,
} from './connection-status.js'

describe('connection status mapping', () => {
  it('maps connecting state correctly during bootstrap', () => {
    const effective = deriveEffectiveConnection({
      backend: 'connecting',
      mqtt: 'connecting',
      lastError: null,
    })
    assert.equal(effective, 'connecting')
  })

  it('considers any connected channel as connected', () => {
    const effective = deriveEffectiveConnection({
      backend: 'connected',
      mqtt: 'disconnected',
      lastError: null,
    })
    assert.equal(effective, 'connected')
    assert.equal(
      isEffectivelyDisconnected({
        backend: 'connected',
        mqtt: 'disconnected',
        lastError: null,
      }),
      false
    )
  })
})
