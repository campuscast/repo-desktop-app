import { useEffect, useRef, useState } from 'react'
import type { ContentAsset } from '../../../electron/shared/ipc-types'
import { usePlaybackStore } from '@/store/playback-store'
import { Loader2 } from 'lucide-react'

interface PlaybackItemProps {
  asset: ContentAsset
}

export function PlaybackItem({ asset }: PlaybackItemProps) {
  const setAssetPath = usePlaybackStore((s) => s.setAssetPath)
  const getAssetPath = usePlaybackStore((s) => s.getAssetPath)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Try to download/cache the asset
  useEffect(() => {
    let cancelled = false

    async function loadAsset() {
      setLoading(true)

      // Check if already cached
      const cached = getAssetPath(asset.asset_id)
      if (cached) {
        setLocalUrl(`file://${cached}`)
        setLoading(false)
        return
      }

      // Download from backend
      try {
        const path = await window.electronAPI.downloadContent(
          asset.download_url,
          asset.asset_id
        )
        if (!cancelled) {
          setAssetPath(asset.asset_id, path)
          setLocalUrl(`file://${path}`)
          setLoading(false)
        }
      } catch {
        // Fall back to remote URL
        if (!cancelled) {
          setLocalUrl(asset.download_url)
          setLoading(false)
        }
      }
    }

    loadAsset()
    return () => {
      cancelled = true
    }
  }, [asset.asset_id, asset.download_url, getAssetPath, setAssetPath])

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    )
  }

  if (!localUrl) return null

  const type = asset.content_type

  // Image content
  if (type.startsWith('image/')) {
    return (
      <img
        src={localUrl}
        alt={asset.filename}
        className="h-full w-full object-contain"
        onError={() => {
          usePlaybackStore.getState().setState({
            status: 'error',
            errors: [`Failed to load image: ${asset.filename}`],
          })
        }}
      />
    )
  }

  // Video content
  if (type.startsWith('video/')) {
    return (
      <video
        ref={videoRef}
        src={localUrl}
        className="h-full w-full object-contain"
        autoPlay
        muted
        onEnded={() => {
          // Restart video for continuous playback within schedule slot
          if (videoRef.current) {
            videoRef.current.currentTime = 0
            videoRef.current.play()
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

  // Fallback: show filename
  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <p className="text-neutral-500">{asset.filename}</p>
    </div>
  )
}
