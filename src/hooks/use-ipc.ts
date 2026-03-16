import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { usePlaybackStore } from '@/store/playback-store'
import type { ConnectionStatus } from '../../electron/shared/ipc-types'

/**
 * Grace period (ms) after activation before showing "disconnected" status.
 * This prevents the brief flash of disconnected state while MQTT/backend
 * connections are being established right after activation.
 */
const DISCONNECT_GRACE_MS = 8000

/** Registers main→renderer IPC event listeners */
export function useIpcEvents() {
  const setDisplays = useAppStore((s) => s.setDisplays)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const addError = useAppStore((s) => s.addError)
  const setManifest = usePlaybackStore((s) => s.setManifest)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasEverConnectedRef = useRef(false)
  const activatedAtRef = useRef<number>(0)

  useEffect(() => {
    const cleanups: Array<() => void> = []
    let mounted = true

    // Record when the app first boots so we know if we're in the post-activation window
    const config = useAppStore.getState().config
    if (config?.activationState === 'activated') {
      activatedAtRef.current = Date.now()
    }

    // Subscribe to activation state changes
    const unsubActivation = useAppStore.subscribe((state) => {
      if (state.activationState === 'activated' && activatedAtRef.current === 0) {
        activatedAtRef.current = Date.now()
      }
    })
    cleanups.push(unsubActivation)

    /**
     * Apply a connection status update with grace period logic:
     * - If the status is "disconnected" and we're within the grace period after activation,
     *   delay showing the disconnected state.
     * - If a "connected" or "connecting" status arrives during the delay, cancel it.
     */
    function applyConnectionStatus(status: ConnectionStatus) {
      const isEffectivelyDisconnected =
        status.backend === 'disconnected' && status.mqtt === 'disconnected'
      const isInGracePeriod =
        activatedAtRef.current > 0 &&
        Date.now() - activatedAtRef.current < DISCONNECT_GRACE_MS

      // Once we've seen a connected state, clear the grace period
      if (status.backend === 'connected' || status.mqtt === 'connected') {
        wasEverConnectedRef.current = true
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current)
          graceTimerRef.current = null
        }
      }

      // If disconnected and still in grace period (never connected yet), delay showing it
      if (isEffectivelyDisconnected && isInGracePeriod && !wasEverConnectedRef.current) {
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current)
        }
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null
          if (mounted) {
            setConnectionStatus(status)
            if (status.lastError) {
              addError(status.lastError)
            }
          }
        }, DISCONNECT_GRACE_MS)
        return
      }

      // Normal path — apply immediately
      setConnectionStatus(status)
      if (status.lastError) {
        addError(status.lastError)
      }
    }

    window.electronAPI
      .getConnectionStatus()
      .then((status) => {
        if (!mounted) return
        applyConnectionStatus(status)
      })
      .catch(() => {
        // Ignore status bootstrap errors
      })

    cleanups.push(
      window.electronAPI.onDisplaysChanged((displays) => {
        setDisplays(displays)
      })
    )

    cleanups.push(
      window.electronAPI.onConnectionStatusChanged((status) => {
        applyConnectionStatus(status)
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
      mounted = false
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
      }
      for (const cleanup of cleanups) cleanup()
    }
  }, [setDisplays, setConnectionStatus, addError, setManifest])
}
