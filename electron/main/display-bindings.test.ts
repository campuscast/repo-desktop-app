import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DisplayInfo, PersistedDisplayBinding } from '../shared/ipc-types.js'
import {
  createDisplayBinding,
  resolveDisplaysForPlayback,
} from './display-bindings.js'

function makeDisplay(
  id: string,
  overrides: Partial<DisplayInfo> = {}
): DisplayInfo {
  return {
    id,
    label: `Display ${id}`,
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    workAreaX: 0,
    workAreaY: 0,
    workAreaWidth: 1920,
    workAreaHeight: 1040,
    isPrimary: false,
    scaleFactor: 1,
    internal: false,
    rotation: 0,
    ...overrides,
  }
}

describe('display binding restore', () => {
  it('prefers exact id matches', () => {
    const displays = [
      makeDisplay('100', { x: 0, isPrimary: true }),
      makeDisplay('200', { x: 1920 }),
    ]

    const bindings = [createDisplayBinding(displays[1])]
    const resolved = resolveDisplaysForPlayback(
      {
        selectedDisplayIds: ['200'],
        selectedDisplayBindings: bindings,
      },
      displays
    )

    assert.equal(resolved.selectedDisplays.length, 1)
    assert.equal(resolved.selectedDisplays[0]?.id, '200')
    assert.equal(resolved.usedFallback, false)
  })

  it('matches by geometry when ids changed after reboot', () => {
    const oldBinding: PersistedDisplayBinding = {
      id: 'old-secondary-id',
      label: 'Display 2',
      width: 2560,
      height: 1440,
      x: 1920,
      y: 0,
      workAreaX: 1920,
      workAreaY: 0,
      workAreaWidth: 2560,
      workAreaHeight: 1400,
      isPrimary: false,
      scaleFactor: 1,
      internal: false,
      rotation: 0,
      capturedAt: '2026-03-19T00:00:00.000Z',
    }
    const displays = [
      makeDisplay('new-primary-id', { isPrimary: true, x: 0 }),
      makeDisplay('new-secondary-id', {
        width: 2560,
        height: 1440,
        x: 1920,
        workAreaX: 1920,
        workAreaWidth: 2560,
        workAreaHeight: 1400,
      }),
    ]

    const resolved = resolveDisplaysForPlayback(
      {
        selectedDisplayIds: ['old-secondary-id'],
        selectedDisplayBindings: [oldBinding],
      },
      displays
    )

    assert.equal(resolved.selectedDisplays.length, 1)
    assert.equal(resolved.selectedDisplays[0]?.id, 'new-secondary-id')
    assert.equal(resolved.usedFallback, false)
  })

  it('falls back safely when no saved display can be matched', () => {
    const displays = [
      makeDisplay('primary', { isPrimary: true }),
      makeDisplay('secondary', { x: 1920 }),
    ]
    const unresolvedBinding: PersistedDisplayBinding = {
      id: 'missing-id',
      label: 'Missing display',
      width: 3840,
      height: 2160,
      x: 5000,
      y: 5000,
      workAreaX: 5000,
      workAreaY: 5000,
      workAreaWidth: 3840,
      workAreaHeight: 2120,
      isPrimary: false,
      scaleFactor: 2,
      internal: false,
      rotation: 0,
      capturedAt: '2026-03-19T00:00:00.000Z',
    }

    const resolved = resolveDisplaysForPlayback(
      {
        selectedDisplayIds: ['missing-id'],
        selectedDisplayBindings: [unresolvedBinding],
      },
      displays
    )

    assert.equal(resolved.selectedDisplays.length, 1)
    assert.equal(resolved.selectedDisplays[0]?.id, 'primary')
    assert.equal(resolved.usedFallback, true)
  })
})
