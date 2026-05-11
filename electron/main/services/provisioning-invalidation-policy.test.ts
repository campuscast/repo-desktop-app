import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  invalidationStatusesFor,
  isProvisioningInvalidationStatus,
} from './provisioning-invalidation-policy.js'

describe('provisioning invalidation policy', () => {
  it('treats 404 as fatal for explicit device validation', () => {
    assert.equal(
      isProvisioningInvalidationStatus(404, 'device-info'),
      true
    )
    assert.equal(
      isProvisioningInvalidationStatus(404, 'device-revalidate'),
      true
    )
  })

  it('treats 404 as fatal for runtime telemetry and heartbeat', () => {
    assert.equal(
      isProvisioningInvalidationStatus(404, 'telemetry'),
      true
    )
    assert.equal(
      isProvisioningInvalidationStatus(404, 'heartbeat'),
      true
    )
  })

  it('does not treat release 404 as fatal deprovision', () => {
    assert.equal(
      isProvisioningInvalidationStatus(404, 'release'),
      false
    )
  })

  it('treats auth invalidation statuses as fatal for telemetry', () => {
    const statuses = invalidationStatusesFor('telemetry')
    assert.deepEqual(statuses, [401, 403, 404, 410])
    assert.equal(
      isProvisioningInvalidationStatus(401, 'telemetry'),
      true
    )
    assert.equal(
      isProvisioningInvalidationStatus(503, 'telemetry'),
      false
    )
  })
})
