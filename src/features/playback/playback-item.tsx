import { useEffect, useRef, useState } from 'react'
import type {
  ContentAsset,
  PublicationItem,
  SlotMetadata,
} from '../../../electron/shared/ipc-types'
import { resolveDesktopVideoAudioConfig } from '../../../electron/shared/video-audio-policy'
import { withErrorTimestamp } from '../../../electron/shared/error-log'
import { usePlaybackStore } from '@/store/playback-store'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import {
  getSlideImageClassName,
  getSlideImageStyle,
  getSlideScrimClassName,
  getSlideTextBlockClassName,
  getSlideTextLayerClassName,
  resolveSlidePresentation,
} from './custom-slide-rendering'

const EMBEDDED_URL_PROTOCOLS = new Set(['http:', 'https:'])
const EXTERNAL_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico']

function normalizeEmbeddedSlideUrl(value?: string | null) {
  const rawValue = (value ?? '').trim()
  if (!rawValue) return ''

  try {
    const parsedUrl = new URL(rawValue)
    return EMBEDDED_URL_PROTOCOLS.has(parsedUrl.protocol) ? parsedUrl.toString() : ''
  } catch {
    return ''
  }
}

function resolveExternalSlideSource(value?: string | null) {
  const normalizedUrl = normalizeEmbeddedSlideUrl(value)
  if (!normalizedUrl) return null

  const pathname = new URL(normalizedUrl).pathname.toLowerCase()
  const kind = EXTERNAL_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension))
    ? 'image'
    : 'web'

  return {
    url: normalizedUrl,
    kind,
  } as const
}

interface PlaybackItemProps {
  asset?: ContentAsset | null
  metadata?: SlotMetadata
  publicationItem?: PublicationItem | null
  transitionTypeOverride?: 'cut' | 'fade'
}

export function PlaybackItem({
  asset,
  metadata,
  publicationItem,
  transitionTypeOverride,
}: PlaybackItemProps) {
  const setAssetPath = usePlaybackStore((s) => s.setAssetPath)
  const getAssetPath = usePlaybackStore((s) => s.getAssetPath)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(asset))
  const [visible, setVisible] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const transitionType =
    transitionTypeOverride
    ?? publicationItem?.transition?.type
    ?? metadata?.transition_type
    ?? 'cut'
  const fadeDuration =
    publicationItem?.transition?.duration_ms ?? metadata?.transition_duration_ms ?? 300
  const trimIn =
    publicationItem?.video?.trim_in_ms ?? metadata?.video_trim_in_ms ?? 0
  const trimOut =
    publicationItem?.video?.trim_out_ms ?? metadata?.video_trim_out_ms ?? 0
  const loop =
    publicationItem?.video?.loop ?? metadata?.video_loop ?? true
  const audioConfig = resolveDesktopVideoAudioConfig(publicationItem, metadata)
  const assetId = asset?.asset_id ?? null
  const assetContentType = asset?.content_type ?? null
  const assetDownloadUrl = asset?.download_url ?? null
  const externalSlideSource =
    publicationItem?.type === 'custom_slide'
      ? resolveExternalSlideSource(publicationItem.slide?.external_url)
      : null

  useEffect(() => {
    let cancelled = false

    async function loadAsset() {
      if (externalSlideSource) {
        setLocalUrl(null)
        setLoading(false)
        return
      }

      if (!assetId || !assetContentType || !assetDownloadUrl) {
        setLocalUrl(null)
        setLoading(false)
        return
      }

      setLoading(true)

      const cached = getAssetPath(assetId)
      if (cached) {
        const persistedFromStore = await window.electronAPI.getCachedContentPath(
          assetId,
          assetContentType,
          assetDownloadUrl
        )
        if (persistedFromStore) {
          if (persistedFromStore !== cached) {
            setAssetPath(assetId, persistedFromStore)
          }
          setLocalUrl(`file://${persistedFromStore}`)
          setLoading(false)
          return
        }
      }

      const persistedCached = await window.electronAPI.getCachedContentPath(
        assetId,
        assetContentType,
        assetDownloadUrl
      )
      if (persistedCached) {
        setAssetPath(assetId, persistedCached)
        setLocalUrl(`file://${persistedCached}`)
        setLoading(false)
        return
      }

      try {
        const path = await window.electronAPI.downloadContent(
          assetDownloadUrl,
          assetId,
          assetContentType
        )
        if (!cancelled) {
          setAssetPath(assetId, path)
          setLocalUrl(`file://${path}`)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setLocalUrl(assetDownloadUrl)
          setLoading(false)
        }
      }
    }

    void loadAsset()
    return () => {
      cancelled = true
    }
  }, [assetContentType, assetDownloadUrl, assetId, externalSlideSource, getAssetPath, setAssetPath])

  useEffect(() => {
    if (!loading) {
      if (transitionType === 'fade') {
        const timer = requestAnimationFrame(() => setVisible(true))
        return () => cancelAnimationFrame(timer)
      }
      setVisible(true)
    }
    setVisible(false)
  }, [loading, transitionType])

  useEffect(() => {
    if (videoRef.current && trimIn > 0) {
      videoRef.current.currentTime = trimIn / 1000
    }
  }, [localUrl, trimIn])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultMuted = audioConfig.defaultMuted
    video.muted = audioConfig.muted
    video.volume = audioConfig.volume
  }, [
    localUrl,
    audioConfig.defaultMuted,
    audioConfig.muted,
    audioConfig.volume,
  ])

  useEffect(() => {
    const video = videoRef.current
    if (!video || trimOut <= 0) return

    const trimOutSeconds = trimOut / 1000
    const player = video
    function handleTimeUpdate() {
      if (player.duration > 0 && trimOutSeconds > 0 && trimOutSeconds < player.duration) {
        if (player.currentTime >= player.duration - trimOutSeconds) {
          if (loop) {
            player.currentTime = trimIn / 1000
            void player.play()
          } else {
            player.pause()
          }
        }
      }
    }

    player.addEventListener('timeupdate', handleTimeUpdate)
    return () => player.removeEventListener('timeupdate', handleTimeUpdate)
  }, [localUrl, trimOut, trimIn, loop])

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    )
  }

  const fadeStyle =
    transitionType === 'fade'
      ? {
          opacity: visible ? 1 : 0,
          transition: `opacity ${fadeDuration}ms ease-in-out`,
        }
      : undefined

  if (publicationItem?.type === 'custom_slide') {
    const model = resolveSlidePresentation(publicationItem.slide)
    const externalSlideUrl = externalSlideSource?.url ?? ''
    const showEmbeddedPage = externalSlideSource?.kind === 'web'

    return (
      <div
        className="relative h-full w-full overflow-hidden text-white"
        style={{
          background: model.background,
          ...fadeStyle,
        }}
      >
        {showEmbeddedPage ? (
          <webview
            src={externalSlideUrl}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            partition="persist:campuscast-playback"
          />
        ) : externalSlideSource?.kind === 'image' ? (
          <img
            src={externalSlideUrl}
            alt={publicationItem.title || model.title || 'External image slide'}
            className={getSlideImageClassName(model.imageFit)}
            style={getSlideImageStyle(model.imageFit)}
          />
        ) : localUrl ? (
          <img
            src={localUrl}
            alt={asset?.filename || 'slide image'}
            className={getSlideImageClassName(model.imageFit)}
            style={getSlideImageStyle(model.imageFit)}
          />
        ) : null}

        {!showEmbeddedPage && model.renderTextOverlay ? (
          <>
            <div className={getSlideScrimClassName(model.layout)} />
            <div className={getSlideTextLayerClassName(model.layout)}>
              <div className={cn(getSlideTextBlockClassName(model.layout), 'text-white')}>
                {model.title ? <h1 className="text-6xl font-bold tracking-tight">{model.title}</h1> : null}
                {model.body ? <p className="text-3xl leading-relaxed text-white/90">{model.body}</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    )
  }

  if (!asset || !localUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <p className="text-neutral-500">No playable asset</p>
      </div>
    )
  }

  const type = asset.content_type

  if (type.startsWith('image/')) {
    return (
      <img
        src={localUrl}
        alt={asset.filename}
        className="h-full w-full object-contain"
        style={fadeStyle}
        onError={() => {
          usePlaybackStore.getState().setState({
            status: 'error',
            errors: [withErrorTimestamp(`Failed to load image: ${asset.filename}`)],
          })
        }}
      />
    )
  }

  if (type.startsWith('video/')) {
    return (
      <video
        ref={videoRef}
        src={localUrl}
        className="h-full w-full object-contain"
        style={fadeStyle}
        autoPlay
        playsInline
        muted={audioConfig.muted}
        loop={loop && trimOut <= 0}
        onLoadedMetadata={() => {
          const video = videoRef.current
          if (!video) return
          video.defaultMuted = audioConfig.defaultMuted
          video.muted = audioConfig.muted
          video.volume = audioConfig.volume
          if (video.paused) {
            void video.play()
          }
        }}
        onEnded={() => {
          if (loop && videoRef.current) {
            videoRef.current.currentTime = trimIn / 1000
            void videoRef.current.play()
          }
        }}
        onError={() => {
          usePlaybackStore.getState().setState({
            status: 'error',
            errors: [withErrorTimestamp(`Failed to play video: ${asset.filename}`)],
          })
        }}
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <p className="text-neutral-500">{asset.filename}</p>
    </div>
  )
}
