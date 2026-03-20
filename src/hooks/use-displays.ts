import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'
import type { PlaybackSessionState } from '../../electron/shared/ipc-types'

export function useDisplays() {
  const displays = useAppStore((s) => s.displays)
  const selectedDisplayIds = useAppStore((s) => s.selectedDisplayIds)
  const setSelectedDisplayIds = useAppStore((s) => s.setSelectedDisplayIds)
  const [playbackSessionState, setPlaybackSessionState] =
    useState<PlaybackSessionState>('stopped')
  const [startInFlight, setStartInFlight] = useState(false)
  const [stopInFlight, setStopInFlight] = useState(false)

  const refreshPlaybackSessionState = useCallback(async () => {
    try {
      const state = await window.electronAPI.getPlaybackSessionState()
      setPlaybackSessionState(state)
    } catch {
      // Best-effort polling
    }
  }, [])

  useEffect(() => {
    void refreshPlaybackSessionState()
    const timer = setInterval(() => {
      void refreshPlaybackSessionState()
    }, 1000)
    return () => clearInterval(timer)
  }, [refreshPlaybackSessionState])

  const toggleDisplay = useCallback(
    async (displayId: string) => {
      const current = selectedDisplayIds
      const next = current.includes(displayId)
        ? current.filter((id) => id !== displayId)
        : [...current, displayId]

      setSelectedDisplayIds(next)
      await window.electronAPI.setSelectedDisplays(next)
    },
    [selectedDisplayIds, setSelectedDisplayIds]
  )

  const startPlayback = useCallback(async () => {
    if (startInFlight || stopInFlight) return
    if (playbackSessionState === 'running') return

    if (selectedDisplayIds.length === 0) {
      toast.error('Select at least one display for playback')
      return
    }
    setStartInFlight(true)
    try {
      const result = await window.electronAPI.openPlaybackWindows()
      await refreshPlaybackSessionState()
      if (!result.allowed && result.reason === 'already-running') {
        return
      }
      toast.success('Playback started')
    } finally {
      setStartInFlight(false)
    }
  }, [
    playbackSessionState,
    refreshPlaybackSessionState,
    selectedDisplayIds,
    startInFlight,
    stopInFlight,
  ])

  const stopPlayback = useCallback(async () => {
    if (startInFlight || stopInFlight) return
    if (playbackSessionState === 'stopped') return
    setStopInFlight(true)
    try {
      const result = await window.electronAPI.closePlaybackWindows()
      await refreshPlaybackSessionState()
      if (!result.allowed && result.reason === 'already-stopped') {
        return
      }
      toast.info('Playback stopped')
    } finally {
      setStopInFlight(false)
    }
  }, [playbackSessionState, refreshPlaybackSessionState, startInFlight, stopInFlight])

  const refreshDisplays = useCallback(async () => {
    const updated = await window.electronAPI.getDisplays()
    useAppStore.getState().setDisplays(updated)
  }, [])

  return {
    displays,
    selectedDisplayIds,
    toggleDisplay,
    startPlayback,
    stopPlayback,
    refreshDisplays,
    playbackSessionState,
    startInFlight,
    stopInFlight,
  }
}
