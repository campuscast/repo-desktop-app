import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DisplayInfo } from '../shared/ipc-types.js'
import {
  buildDisplayTopologySignature,
  hasMeaningfulDisplayTopologyChange,
} from './display-topology.js'

function makeDisplay(overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    id: 'display-1',
    label: 'Display 1',
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    workAreaX: 0,
    workAreaY: 25,
    workAreaWidth: 1920,
    workAreaHeight: 1055,
    isPrimary: true,
    scaleFactor: 2,
    internal: true,
    rotation: 0,
    ...overrides,
  }
}

describe('display topology helpers', () => {
  it('ignores work-area-only changes', () => {
    const previous = [makeDisplay()]
    const next = [
      makeDisplay({
        workAreaY: 0,
        workAreaHeight: 1080,
      }),
    ]

    assert.equal(hasMeaningfulDisplayTopologyChange(previous, next), false)
  })

  it('detects physical bounds changes', () => {
    const previous = [makeDisplay()]
    const next = [
      makeDisplay({
        width: 2560,
        height: 1440,
      }),
    ]

    assert.equal(hasMeaningfulDisplayTopologyChange(previous, next), true)
  })

  it('produces the same signature regardless of input order', () => {
    const first = [
      makeDisplay({ id: 'display-2', x: 1920, internal: false, isPrimary: false }),
      makeDisplay({ id: 'display-1' }),
    ]
    const second = [...first].reverse()

    assert.equal(
      buildDisplayTopologySignature(first),
      buildDisplayTopologySignature(second)
    )
  })
})
