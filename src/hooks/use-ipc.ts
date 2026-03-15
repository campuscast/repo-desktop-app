import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { usePlaybackStore } from '@/store/playback-store'

/** Registers main→renderer IPC event listeners */
export function useIpcEvents() {
  const setDisplays = useAppStore((s) => s.setDisplays)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const addError = useAppStore((s) => s.addError)
  const setManifest = usePlaybackStore((s) => s.setManifest)

  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.electronAPI.onDisplaysChanged((displays) => {
        setDisplays(displays)
      })
    )

    cleanups.push(
      window.electronAPI.onConnectionStatusChanged((status) => {
        setConnectionStatus(status)
        if (status.lastError) {
          addError(status.lastError)
        }
      })
    )

    cleanups.push(
      window.electronAPI.onNewRelease(async (notification) => {
        try {
          const manifest = await window.electronAPI.fetchManifest(
            notification.release_id
          )
          setManifest(manifest)
        } catch (err) {
          addError(
            `Failed to fetch release ${notification.release_id}: ${err}`
          )
        }
      })
    )

    cleanups.push(
      window.electronAPI.onPlaybackScheduleUpdate((manifest) => {
        setManifest(manifest)
      })
    )

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [setDisplays, setConnectionStatus, addError, setManifest])
}
