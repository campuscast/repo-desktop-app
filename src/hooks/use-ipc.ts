import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { usePlaybackStore } from '@/store/playback-store'
import type { ConnectionStatus } from '../../electron/shared/ipc-types'
import { isEffectivelyDisconnected } from '../../electron/shared/connection-status'

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
  const setConfig = useAppStore((s) => s.setConfig)
  const setScreen = useAppStore((s) => s.setScreen)
  const addError = useAppStore((s) => s.addError)
  const setManifest = usePlaybackStore((s) => s.setManifest)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasEverConnectedRef = useRef(false)
  const activatedAtRef = useRef<number>(0)
  const latestStatusRef = useRef<ConnectionStatus | null>(null)
  const pendingStatusRef = useRef<ConnectionStatus | null>(null)
  const configReadyRef = useRef(false)

  useEffect(() => {
    const cleanups: Array<() => void> = []
    let mounted = true

    /**
     * Apply a connection status update with grace period logic:
     * - If the status is "disconnected" and we're within the grace period after activation,
     *   delay showing the disconnected state.
     * - If a "connected" or "connecting" status arrives during the delay, cancel it.
     */
    function applyConnectionStatus(status: ConnectionStatus) {
      latestStatusRef.current = status

      if (!configReadyRef.current) {
        const cfg = useAppStore.getState().config
        if (!cfg) {
          // Avoid flashing stale disconnected state before config hydration.
          pendingStatusRef.current = status
          return
        }
        configReadyRef.current = true
        if (cfg.activationState === 'activated' && activatedAtRef.current === 0) {
          activatedAtRef.current = Date.now()
        }
      }

      const disconnected = isEffectivelyDisconnected(status)
      const isInGracePeriod =
        activatedAtRef.current > 0 &&
        Date.now() - activatedAtRef.current < DISCONNECT_GRACE_MS

      // Cancel delayed disconnected update once any non-disconnected status appears.
      if (!disconnected && graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
        graceTimerRef.current = null
      }

      // Once we've seen a connected state, disconnected flashes should no longer be delayed.
      if (status.backend === 'connected' || status.mqtt === 'connected') {
        wasEverConnectedRef.current = true
      }

      // If disconnected and still in grace period (never connected yet), delay showing it
      if (disconnected && isInGracePeriod && !wasEverConnectedRef.current) {
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current)
        }
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null
          if (mounted) {
            const latest = latestStatusRef.current
            if (!latest || !isEffectivelyDisconnected(latest)) return
            setConnectionStatus(latest)
            if (latest.lastError) {
              addError(latest.lastError)
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

    // Watch activation/config hydration so post-activation grace logic has a correct baseline.
    const unsubActivation = useAppStore.subscribe((state, previous) => {
      if (!configReadyRef.current && state.config) {
        configReadyRef.current = true
        if (state.config.activationState === 'activated' && activatedAtRef.current === 0) {
          activatedAtRef.current = Date.now()
        }
        if (pendingStatusRef.current) {
          const pending = pendingStatusRef.current
          pendingStatusRef.current = null
          applyConnectionStatus(pending)
        }
      }

      if (
        state.activationState === 'activated'
        && previous.activationState !== 'activated'
        && activatedAtRef.current === 0
      ) {
        activatedAtRef.current = Date.now()
      }
    })
    cleanups.push(unsubActivation)

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

    cleanups.push(
      window.electronAPI.onActivationInvalidated((reason) => {
        addError(reason)
        void window.electronAPI.getConfig().then((cfg) => {
          if (!mounted) return
          setConfig(cfg)
          setManifest(null)
          setScreen('setup')
        })
      })
    )

    return () => {
      mounted = false
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
      }
      for (const cleanup of cleanups) cleanup()
    }
  }, [setDisplays, setConnectionStatus, setConfig, setScreen, addError, setManifest])
}
