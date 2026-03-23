import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getSlideImageClassName,
  normalizeSlideImageFitMode,
  resolveSlidePresentation,
} from '../src/features/playback/custom-slide-rendering.ts'

describe('desktop custom slide rendering semantics', () => {
  it('respects image fit mode mapping', () => {
    assert.equal(getSlideImageClassName('cover'), 'absolute inset-0 h-full w-full object-cover')
    assert.equal(getSlideImageClassName('contain'), 'absolute inset-0 h-full w-full object-contain')
    assert.equal(getSlideImageClassName('stretch'), 'absolute inset-0 h-full w-full object-fill')
    assert.match(getSlideImageClassName('center'), /object-none/)
  })

  it('applies backward-compatible defaults for legacy items', () => {
    const model = resolveSlidePresentation({
      title: 'Legacy title',
      body: 'Legacy body',
    })

    assert.equal(model.imageFit, 'cover')
    assert.equal(model.layout, 'centered')
    assert.equal(model.showTextOverlay, true)
    assert.equal(model.renderTextOverlay, true)
  })

  it('keeps image-only slide fullscreen in cover mode', () => {
    const model = resolveSlidePresentation({
      image_fit: 'cover',
      text_overlay: false,
      title: 'Should not render',
      body: 'Should not render',
    })

    assert.equal(model.imageFit, 'cover')
    assert.equal(model.renderTextOverlay, false)
    assert.equal(normalizeSlideImageFitMode(undefined), 'cover')
  })
})
