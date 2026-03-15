import { useEffect, useRef } from 'react'
import { usePlaybackStore } from '@/store/playback-store'
import { PlaybackItem } from './playback-item'
import { Monitor, Clock, WifiOff } from 'lucide-react'

interface PlaybackScreenProps {
  displayId: string | null
}

const SCHEDULE_TICK_MS = 1000

/** Fullscreen playback renderer — runs in playback windows */
export function PlaybackScreen({ displayId }: PlaybackScreenProps) {
  const state = usePlaybackStore((s) => s.state)
  const manifest = usePlaybackStore((s) => s.manifest)
  const evaluateSchedule = usePlaybackStore((s) => s.evaluateSchedule)
  const setManifest = usePlaybackStore((s) => s.setManifest)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load manifest on mount (from main process cache)
  useEffect(() => {
    async function loadManifest() {
      try {
        const release = await window.electronAPI.fetchRelease()
        if (release) {
          const m = await window.electronAPI.fetchManifest(release.release_id)
          setManifest(m)
        }
      } catch {
        // Use cached manifest if available
      }
    }
    loadManifest()
  }, [setManifest])

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

  // Idle state — nothing scheduled
  if (state.status === 'idle' || !state.currentSlot) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
        <Monitor className="h-16 w-16 text-neutral-700" />
        <p className="text-lg text-neutral-600">CampusCast Player</p>
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
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
        <WifiOff className="h-16 w-16 text-neutral-700" />
        <p className="text-lg text-neutral-600">
          Offline — displaying cached content
        </p>
      </div>
    )
  }

  // Playing state
  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {state.currentAsset && (
        <PlaybackItem asset={state.currentAsset} />
      )}
    </div>
  )
}
