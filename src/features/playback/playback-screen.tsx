import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlaybackStore } from '@/store/playback-store'
import { PlaybackItem } from './playback-item'
import { Monitor, Clock, WifiOff } from 'lucide-react'
import type {
  ContentAsset,
  PublicationItem,
  SlotMetadata,
} from '../../../electron/shared/ipc-types'

interface PlaybackScreenProps {
  displayId: string | null
}

interface PlaybackFrame {
  key: string
  asset: ContentAsset | null
  metadata?: SlotMetadata
  publicationItem: PublicationItem | null
}

const SCHEDULE_TICK_MS = 1000

function resolveFrameTransition(frame: PlaybackFrame | null): {
  type: 'cut' | 'fade'
  durationMs: number
} {
  if (!frame) {
    return { type: 'cut', durationMs: 0 }
  }

  return {
    type:
      frame.publicationItem?.transition?.type
      ?? frame.metadata?.transition_type
      ?? 'cut',
    durationMs:
      frame.publicationItem?.transition?.duration_ms
      ?? frame.metadata?.transition_duration_ms
      ?? 300,
  }
}

/** Fullscreen playback renderer — runs in playback windows */
export function PlaybackScreen({ displayId }: PlaybackScreenProps) {
  const state = usePlaybackStore((s) => s.state)
  const manifest = usePlaybackStore((s) => s.manifest)
  const evaluateSchedule = usePlaybackStore((s) => s.evaluateSchedule)
  const setManifest = usePlaybackStore((s) => s.setManifest)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentFrameRef = useRef<PlaybackFrame | null>(null)
  const [currentFrame, setCurrentFrame] = useState<PlaybackFrame | null>(null)
  const [previousFrame, setPreviousFrame] = useState<PlaybackFrame | null>(null)

  const activeFrame = useMemo<PlaybackFrame | null>(() => {
    if (!state.currentSlot) {
      return null
    }

    const manifestKey = manifest?.manifest_hash ?? manifest?.release_id ?? 'manifest'
    const itemKey =
      state.currentPublicationItem?.item_id
      ?? state.currentAsset?.asset_id
      ?? state.currentSlot.slot_id
    const assetKey = state.currentAsset?.asset_id ?? 'no-asset'

    return {
      key: `${manifestKey}:${state.currentSlot.slot_id}:${itemKey}:${assetKey}`,
      asset: state.currentAsset,
      metadata: state.currentSlot.metadata,
      publicationItem: state.currentPublicationItem,
    }
  }, [
    manifest?.manifest_hash,
    manifest?.release_id,
    state.currentAsset,
    state.currentPublicationItem,
    state.currentSlot,
  ])

  // Load manifest on mount (from main process cache)
  useEffect(() => {
    window.electronAPI.startupMark('renderer:playback-bootstrap:start', `display=${displayId ?? 'unknown'}`)
    async function loadManifest() {
      try {
        const release = await window.electronAPI.fetchRelease()
        if (release) {
          const m = await window.electronAPI.fetchManifest(release.release_id)
          setManifest(m)
          window.electronAPI.startupMark(
            'renderer:playback-bootstrap:manifest-loaded',
            `release=${release.release_id}`
          )
        }
      } catch {
        // Use cached manifest if available
        window.electronAPI.startupMark('renderer:playback-bootstrap:fallback')
      }
    }
    loadManifest()
  }, [displayId, setManifest])

  // Schedule evaluation tick
  useEffect(() => {
    evaluateSchedule()
    tickRef.current = setInterval(evaluateSchedule, SCHEDULE_TICK_MS)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [evaluateSchedule, manifest])

  // Listen for manifest updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onPlaybackScheduleUpdate((m) => {
      setManifest(m)
    })
    return cleanup
  }, [setManifest])

  useEffect(() => {
    return () => {
      if (fadeCleanupRef.current) {
        clearTimeout(fadeCleanupRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (fadeCleanupRef.current) {
      clearTimeout(fadeCleanupRef.current)
      fadeCleanupRef.current = null
    }

    if (!activeFrame) {
      currentFrameRef.current = null
      setCurrentFrame(null)
      setPreviousFrame(null)
      return
    }

    const lastFrame = currentFrameRef.current
    if (!lastFrame) {
      currentFrameRef.current = activeFrame
      setCurrentFrame(activeFrame)
      setPreviousFrame(null)
      return
    }

    if (lastFrame.key === activeFrame.key) {
      currentFrameRef.current = activeFrame
      setCurrentFrame(activeFrame)
      return
    }

    const transition = resolveFrameTransition(activeFrame)
    if (transition.type === 'fade') {
      setPreviousFrame(lastFrame)
      fadeCleanupRef.current = setTimeout(() => {
        setPreviousFrame((entry) =>
          entry?.key === lastFrame.key ? null : entry
        )
        fadeCleanupRef.current = null
      }, Math.max(0, transition.durationMs))
    } else {
      setPreviousFrame(null)
    }

    currentFrameRef.current = activeFrame
    setCurrentFrame(activeFrame)
  }, [activeFrame])

  // Idle state — nothing scheduled
  if (state.status === 'idle' || !state.currentSlot) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black">
        <Monitor className="h-16 w-16 text-neutral-700" />
        <p className="text-lg text-neutral-600">CampusCast Player</p>
        <p className="text-sm text-neutral-700">Nothing to play right now</p>
        {state.nextSlot && (
          <div className="flex items-center gap-2 text-sm text-neutral-700">
            <Clock className="h-4 w-4" />
            Next: {new Date(state.nextSlot.start_time).toLocaleTimeString()}
          </div>
        )}
      </div>
    )
  }

  // Offline state
  if (state.status === 'offline') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black">
        <WifiOff className="h-16 w-16 text-neutral-700" />
        <p className="text-lg text-neutral-600">
          Offline — displaying cached content
        </p>
      </div>
    )
  }

  // Playing state
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {previousFrame ? (
        <div className="absolute inset-0 z-0">
          <PlaybackItem
            key={`previous:${previousFrame.key}`}
            asset={previousFrame.asset}
            metadata={previousFrame.metadata}
            publicationItem={previousFrame.publicationItem}
            transitionTypeOverride="cut"
          />
        </div>
      ) : null}

      {currentFrame ? (
        <div className="absolute inset-0 z-10">
          <PlaybackItem
            key={`current:${currentFrame.key}`}
            asset={currentFrame.asset}
            metadata={currentFrame.metadata}
            publicationItem={currentFrame.publicationItem}
          />
        </div>
      ) : null}
    </div>
  )
}
