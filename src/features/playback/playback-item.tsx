import { useEffect, useRef, useState } from 'react'
import type {
  ContentAsset,
  PublicationItem,
  SlotMetadata,
} from '../../../electron/shared/ipc-types'
import { usePlaybackStore } from '@/store/playback-store'
import { Loader2 } from 'lucide-react'

interface PlaybackItemProps {
  asset?: ContentAsset | null
  metadata?: SlotMetadata
  publicationItem?: PublicationItem | null
}

export function PlaybackItem({
  asset,
  metadata,
  publicationItem,
}: PlaybackItemProps) {
  const setAssetPath = usePlaybackStore((s) => s.setAssetPath)
  const getAssetPath = usePlaybackStore((s) => s.getAssetPath)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(asset))
  const [visible, setVisible] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const transitionType =
    publicationItem?.transition?.type ?? metadata?.transition_type ?? 'cut'
  const fadeDuration =
    publicationItem?.transition?.duration_ms ?? metadata?.transition_duration_ms ?? 300
  const trimIn =
    publicationItem?.video?.trim_in_ms ?? metadata?.video_trim_in_ms ?? 0
  const trimOut =
    publicationItem?.video?.trim_out_ms ?? metadata?.video_trim_out_ms ?? 0
  const muted =
    publicationItem?.video?.mute ?? metadata?.video_mute ?? true
  const loop =
    publicationItem?.video?.loop ?? metadata?.video_loop ?? true

  useEffect(() => {
    let cancelled = false

    async function loadAsset() {
      if (!asset) {
        setLocalUrl(null)
        setLoading(false)
        return
      }

      setLoading(true)

      const cached = getAssetPath(asset.asset_id)
      if (cached) {
        setLocalUrl(`file://${cached}`)
        setLoading(false)
        return
      }

      const persistedCached = await window.electronAPI.getCachedContentPath(
        asset.asset_id,
        asset.content_type,
        asset.download_url
      )
      if (persistedCached) {
        setAssetPath(asset.asset_id, persistedCached)
        setLocalUrl(`file://${persistedCached}`)
        setLoading(false)
        return
      }

      try {
        const path = await window.electronAPI.downloadContent(
          asset.download_url,
          asset.asset_id,
          asset.content_type
        )
        if (!cancelled) {
          setAssetPath(asset.asset_id, path)
          setLocalUrl(`file://${path}`)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setLocalUrl(asset.download_url)
          setLoading(false)
        }
      }
    }

    void loadAsset()
    return () => {
      cancelled = true
    }
  }, [asset, getAssetPath, setAssetPath])

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
    const slide = publicationItem.slide || {}
    return (
      <div
        className="flex h-full w-full items-center justify-center p-10 text-white"
        style={{
          background: slide.background || '#111827',
          ...fadeStyle,
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {slide.title ? <h1 className="text-4xl font-bold">{slide.title}</h1> : null}
          {slide.body ? <p className="max-w-3xl text-xl text-white/90">{slide.body}</p> : null}
          {localUrl ? (
            <img
              src={localUrl}
              alt={asset?.filename || 'slide image'}
              className="max-h-[50vh] max-w-[60vw] object-contain"
            />
          ) : null}
        </div>
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
            errors: [`Failed to load image: ${asset.filename}`],
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
        muted={muted}
        loop={loop && trimOut <= 0}
        onEnded={() => {
          if (loop && videoRef.current) {
            videoRef.current.currentTime = trimIn / 1000
            void videoRef.current.play()
          }
        }}
        onError={() => {
          usePlaybackStore.getState().setState({
            status: 'error',
            errors: [`Failed to play video: ${asset.filename}`],
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
