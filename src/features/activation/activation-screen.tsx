import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Monitor,
  Loader2,
  RefreshCw,
  CheckCircle2,
  WifiOff,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'

const POLL_INTERVAL = 3000 // 3 seconds

export function ActivationScreen() {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setScreen = useAppStore((s) => s.setScreen)

  const [activationCode, setActivationCode] = useState<string | null>(null)
  const [expiresIn, setExpiresIn] = useState<number>(0)
  const [status, setStatus] = useState<
    'loading' | 'showing' | 'polling' | 'activated' | 'error'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiryRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const deviceId = config?.deviceId

  const requestCode = useCallback(async () => {
    if (!deviceId) return
    setStatus('loading')
    setError(null)

    try {
      const result = await window.electronAPI.requestActivationCode(deviceId)
      setActivationCode(result.activation_code)
      setExpiresIn(result.expires_in)
      setStatus('showing')
      startPolling(deviceId, result.activation_code)
      startExpiryCountdown(result.expires_in)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to request activation code'
      )
      setStatus('error')
    }
  }, [deviceId])

  function startPolling(devId: string, code: string) {
    stopPolling()
    setStatus('polling')

    pollRef.current = setInterval(async () => {
      try {
        const creds = await window.electronAPI.pollCredentials(devId, code)
        if (creds) {
          stopPolling()
          stopExpiry()
          setStatus('activated')

          // Reload config to get updated state
          const updated = await window.electronAPI.getConfig()
          setConfig(updated)

          // Transition to main screen after brief success display
          setTimeout(() => setScreen('diagnostics'), 1500)
        }
      } catch {
        // Polling errors are non-fatal
      }
    }, POLL_INTERVAL)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startExpiryCountdown(seconds: number) {
    stopExpiry()
    let remaining = seconds
    setExpiresIn(remaining)

    expiryRef.current = setInterval(() => {
      remaining--
      setExpiresIn(remaining)
      if (remaining <= 0) {
        stopExpiry()
        stopPolling()
        setStatus('error')
        setError('Activation code expired. Request a new one.')
      }
    }, 1000)
  }

  function stopExpiry() {
    if (expiryRef.current) {
      clearInterval(expiryRef.current)
      expiryRef.current = null
    }
  }

  // Request code on mount
  useEffect(() => {
    requestCode()
    return () => {
      stopPolling()
      stopExpiry()
    }
  }, [requestCode])

  const minutes = Math.floor(expiresIn / 60)
  const seconds = expiresIn % 60

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-background p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Monitor className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          CampusCast Player
        </h1>
      </div>

      {/* Activation Code Display */}
      <div className="flex flex-col items-center gap-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Requesting activation code...</span>
          </div>
        )}

        {(status === 'showing' || status === 'polling') && activationCode && (
          <>
            <p className="text-sm text-muted-foreground">
              Enter this code in CMS to activate the player
            </p>
            <div className="activation-code rounded-xl border border-border bg-card px-10 py-6 text-primary">
              {activationCode}
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="font-mono">
                Expires in {minutes}:{String(seconds).padStart(2, '0')}
              </Badge>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for activation...
              </div>
            </div>
          </>
        )}

        {status === 'activated' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <p className="text-lg font-medium text-success">
              Player Activated
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <WifiOff className="h-12 w-12 text-destructive" />
            <p className="max-w-sm text-center text-sm text-destructive">
              {error}
            </p>
            <Button onClick={requestCode} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Request New Code
            </Button>
          </div>
        )}
      </div>

      {/* Device Info */}
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <span>
          Device ID:{' '}
          <span className="font-mono">{deviceId ?? 'Not set'}</span>
        </span>
      </div>

      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setScreen('setup')}
        className="absolute left-4 top-4"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </Button>
    </div>
  )
}
