import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPresignedDownloadUrl } from './content-cache.js'

describe('content cache URL auth policy', () => {
  it('detects AWS SigV4 presigned URLs', () => {
    const url =
      'http://localhost:9000/campuscast-content/zone/key.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123'

    assert.equal(isPresignedDownloadUrl(url), true)
  })

  it('detects lowercase presign query params', () => {
    const url =
      'http://localhost:9000/campuscast-content/zone/key.mp4?x-amz-signature=abc123'

    assert.equal(isPresignedDownloadUrl(url), true)
  })

  it('does not treat regular backend endpoints as presigned', () => {
    const url = 'http://localhost:3000/api/v1/player/content/asset-1'

    assert.equal(isPresignedDownloadUrl(url), false)
  })
})
