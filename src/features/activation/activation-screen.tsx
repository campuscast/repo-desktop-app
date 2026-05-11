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
import { useLocale } from '@/hooks/use-locale'

const POLL_INTERVAL = 3000 // 3 seconds
const CODE_TTL_SECONDS = 15 * 60

function extractStatusCode(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const msg = err.message
  const match = msg.match(/HTTP\s+(\d{3})/)
  if (match) return Number(match[1])
  const jsonMatch = msg.match(/"statusCode"\s*:\s*(\d{3})/)
  if (jsonMatch) return Number(jsonMatch[1])
  return null
}

export function ActivationScreen() {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setScreen = useAppStore((s) => s.setScreen)
  const { t } = useLocale()

  const [activationCode, setActivationCode] = useState<string | null>(null)
  const [expiresIn, setExpiresIn] = useState<number>(0)
  const [status, setStatus] = useState<
    'loading' | 'showing' | 'polling' | 'activated' | 'error'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiryRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activatedRef = useRef(false)

  const deviceId = config?.deviceId
  const storedCode = config?.pendingActivationCode ?? null
  const storedCodeRequestedAt = config?.pendingActivationRequestedAt ?? null

  const clearStoredCode = useCallback(async () => {
    try {
      const updated = await window.electronAPI.saveConfig({
        pendingActivationCode: null,
        pendingActivationRequestedAt: null,
      })
      setConfig(updated)
    } catch {
      // Non-fatal
    }
  }, [setConfig])

  const getStoredCodeState = useCallback((): { code: string; remainingSeconds: number } | null => {
    if (!storedCode || !storedCodeRequestedAt) return null
    const requestedAtMs = Date.parse(storedCodeRequestedAt)
    if (!Number.isFinite(requestedAtMs)) return null
    const elapsedSeconds = Math.floor((Date.now() - requestedAtMs) / 1000)
    const remainingSeconds = CODE_TTL_SECONDS - elapsedSeconds
    if (remainingSeconds <= 0) return null
    return { code: storedCode, remainingSeconds }
  }, [storedCode, storedCodeRequestedAt])

  const startPolling = useCallback((devId: string, code: string) => {
    stopPolling()
    setStatus('polling')

    pollRef.current = setInterval(async () => {
      try {
        const creds = await window.electronAPI.pollCredentials(devId, code)
        if (creds) {
          activatedRef.current = true
          stopPolling()
          stopExpiry()
          await clearStoredCode()
          setStatus('activated')

          // Reload config to get updated state
          const updated = await window.electronAPI.getConfig()
          setConfig(updated)

          // Clear any transient errors before transitioning
          useAppStore.getState().clearErrors()

          // Transition to main screen after brief success display
          setTimeout(() => setScreen('diagnostics'), 1500)
        }
      } catch {
        // Polling errors are non-fatal
      }
    }, POLL_INTERVAL)
  }, [clearStoredCode, setConfig, setScreen])

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
        setError(t('activation.expired'))
        clearStoredCode()
      }
    }, 1000)
  }

  function stopExpiry() {
    if (expiryRef.current) {
      clearInterval(expiryRef.current)
      expiryRef.current = null
    }
  }

  const requestCode = useCallback(async () => {
    if (!deviceId) return
    setStatus('loading')
    setError(null)

    try {
      const result = await window.electronAPI.requestActivationCode(deviceId)
      const updated = await window.electronAPI.saveConfig({
        pendingActivationCode: result.activation_code,
        pendingActivationRequestedAt: new Date().toISOString(),
      })
      setConfig(updated)

      setActivationCode(result.activation_code)
      setExpiresIn(result.expires_in)
      setStatus('showing')
      startPolling(deviceId, result.activation_code)
      startExpiryCountdown(result.expires_in)
    } catch (err) {
      const statusCode = extractStatusCode(err)
      const cached = getStoredCodeState()

      // Device may already be activated in CMS. Try to finish with a cached code from this device.
      if (statusCode === 409 && cached) {
        setActivationCode(cached.code)
        setExpiresIn(cached.remainingSeconds)
        setStatus('polling')
        startPolling(deviceId, cached.code)
        startExpiryCountdown(cached.remainingSeconds)
        return
      }

      if (statusCode === 409) {
        setError(t('activation.alreadyActivated'))
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to request activation code'
        )
      }
      setStatus('error')
    }
  }, [deviceId, getStoredCodeState, setConfig, startPolling])

  // Recover cached activation flow if available, otherwise request a new code.
  useEffect(() => {
    // Don't re-run after activation succeeds (config change from clearStoredCode
    // would otherwise re-trigger this effect and cause a 409 error flash).
    if (activatedRef.current) return

    if (!deviceId) {
      setStatus('error')
      setError(t('activation.noDeviceId'))
      return
    }

    const cached = getStoredCodeState()
    if (cached) {
      setActivationCode(cached.code)
      setExpiresIn(cached.remainingSeconds)
      setStatus('showing')
      startPolling(deviceId, cached.code)
      startExpiryCountdown(cached.remainingSeconds)
    } else {
      requestCode()
    }

    return () => {
      stopPolling()
      stopExpiry()
    }
  }, [deviceId, getStoredCodeState, requestCode, startPolling])

  const minutes = Math.floor(expiresIn / 60)
  const seconds = expiresIn % 60

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 bg-background p-8">
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
            <span>{t('activation.requesting')}</span>
          </div>
        )}

        {(status === 'showing' || status === 'polling') && activationCode && (
          <>
            <p className="text-sm text-muted-foreground">
              {t('activation.enterCode')}
            </p>
            <div className="activation-code rounded-xl border border-border bg-card px-10 py-6 text-primary">
              {activationCode}
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="font-mono">
                {t('activation.expiresIn')} {minutes}:{String(seconds).padStart(2, '0')}
              </Badge>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('activation.waiting')}
              </div>
            </div>
          </>
        )}

        {status === 'activated' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <p className="text-lg font-medium text-success">
              {t('activation.activated')}
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
              {t('activation.requestNew')}
            </Button>
          </div>
        )}
      </div>

      {/* Device Info */}
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <span>
          {t('activation.deviceId')}:{' '}
          <span className="font-mono">{deviceId ?? t('activation.notSet')}</span>
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
        {t('activation.back')}
      </Button>
    </div>
  )
}
