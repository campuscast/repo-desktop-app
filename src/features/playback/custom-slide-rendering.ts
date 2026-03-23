import type { CSSProperties } from 'react'

export type SlideLayout = 'centered' | 'split' | 'title-top'
export type SlideImageFitMode = 'cover' | 'contain' | 'stretch' | 'center'

export const DEFAULT_SLIDE_BACKGROUND = '#0f172a'
export const DEFAULT_SLIDE_LAYOUT: SlideLayout = 'centered'
export const DEFAULT_SLIDE_IMAGE_FIT: SlideImageFitMode = 'cover'

export interface SlidePresentationInput {
  background?: string
  title?: string
  body?: string
  layout?: string
  image_fit?: string
  text_overlay?: boolean
}

export interface ResolvedSlidePresentation {
  background: string
  title: string
  body: string
  layout: SlideLayout
  imageFit: SlideImageFitMode
  hasText: boolean
  showTextOverlay: boolean
  renderTextOverlay: boolean
}

export function normalizeSlideLayout(layout?: string): SlideLayout {
  return layout === 'split' || layout === 'title-top' ? layout : DEFAULT_SLIDE_LAYOUT
}

export function normalizeSlideImageFitMode(mode?: string): SlideImageFitMode {
  if (mode === 'contain' || mode === 'stretch' || mode === 'center') {
    return mode
  }
  return DEFAULT_SLIDE_IMAGE_FIT
}

export function hasSlideTextContent(title?: string, body?: string) {
  return (title || '').trim().length > 0 || (body || '').trim().length > 0
}

export function resolveSlidePresentation(slide?: SlidePresentationInput): ResolvedSlidePresentation {
  const title = slide?.title || ''
  const body = slide?.body || ''
  const hasText = hasSlideTextContent(title, body)
  const showTextOverlay = slide?.text_overlay ?? true

  return {
    background: slide?.background || DEFAULT_SLIDE_BACKGROUND,
    title,
    body,
    layout: normalizeSlideLayout(slide?.layout),
    imageFit: normalizeSlideImageFitMode(slide?.image_fit),
    hasText,
    showTextOverlay,
    renderTextOverlay: showTextOverlay && hasText,
  }
}

export function getSlideImageClassName(mode: SlideImageFitMode) {
  switch (mode) {
    case 'contain':
      return 'absolute inset-0 h-full w-full object-contain'
    case 'stretch':
      return 'absolute inset-0 h-full w-full object-fill'
    case 'center':
      return 'absolute left-1/2 top-1/2 h-auto w-auto max-h-none max-w-none -translate-x-1/2 -translate-y-1/2 object-none object-center'
    case 'cover':
    default:
      return 'absolute inset-0 h-full w-full object-cover'
  }
}

export function getSlideImageStyle(mode: SlideImageFitMode): CSSProperties | undefined {
  if (mode !== 'center') {
    return undefined
  }

  return {
    width: 'auto',
    height: 'auto',
  }
}

export function getSlideScrimClassName(layout: SlideLayout) {
  switch (layout) {
    case 'split':
      return 'absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/15'
    case 'title-top':
      return 'absolute inset-0 bg-gradient-to-b from-black/70 via-black/28 to-black/18'
    case 'centered':
    default:
      return 'absolute inset-0 bg-black/42'
  }
}

export function getSlideTextLayerClassName(layout: SlideLayout) {
  switch (layout) {
    case 'split':
      return 'relative z-10 flex h-full w-full items-stretch justify-start'
    case 'title-top':
      return 'relative z-10 flex h-full w-full items-start justify-start p-20'
    case 'centered':
    default:
      return 'relative z-10 flex h-full w-full items-center justify-center p-20'
  }
}

export function getSlideTextBlockClassName(layout: SlideLayout) {
  switch (layout) {
    case 'split':
      return 'flex h-full w-[46%] max-w-[72%] flex-col justify-center gap-8 bg-black/32 px-20 py-20 text-left'
    case 'title-top':
      return 'flex max-w-[min(88%,62ch)] flex-col gap-8 text-left'
    case 'centered':
    default:
      return 'flex max-w-[min(88%,68ch)] flex-col items-center gap-8 text-center'
  }
}
