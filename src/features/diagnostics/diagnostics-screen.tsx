import { useCallback, useEffect, useState } from 'react'
import {
  Wifi,
  WifiOff,
  Monitor,
  Clock,
  Play,
  RefreshCw,
  Power,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/app-store'
import { usePlaybackStore } from '@/store/playback-store'
import { useDisplays } from '@/hooks/use-displays'
import { useLocale } from '@/hooks/use-locale'
import { formatTime } from '@/lib/utils'
import type { PlayerHealthSnapshot } from '../../../electron/shared/ipc-types'
import { deriveEffectiveConnection } from '../../../electron/shared/connection-status'

export function DiagnosticsScreen() {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setScreen = useAppStore((s) => s.setScreen)
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const errors = useAppStore((s) => s.errors)
  const playbackState = usePlaybackStore((s) => s.state)
  const {
    displays,
    selectedDisplayIds,
    startPlayback,
    stopPlayback,
    playbackSessionState,
    startInFlight,
    stopInFlight,
  } = useDisplays()
  const [syncing, setSyncing] = useState(false)
  const [health, setHealth] = useState<PlayerHealthSnapshot | null>(null)
  const { t } = useLocale()

  const effectiveConnection = deriveEffectiveConnection(connectionStatus)
  const hasNoScheduledContent =
    playbackSessionState === 'running'
    && playbackState.status === 'idle'
    && !playbackState.currentSlot
  const playbackStatusLabel = startInFlight
    ? t('diagnostics.starting')
    : stopInFlight
      ? t('diagnostics.stopping')
      : hasNoScheduledContent
        ? t('diagnostics.noScheduledContent')
        : playbackState.status
  const playbackBadgeVariant: 'success' | 'destructive' | 'warning' | 'secondary' =
    startInFlight || stopInFlight
      ? 'warning'
      : playbackState.status === 'playing'
        ? 'success'
        : playbackState.status === 'error'
          ? 'destructive'
          : 'secondary'
  const canStartPlayback =
    !startInFlight && !stopInFlight && playbackSessionState === 'stopped'
  const canStopPlayback =
    !startInFlight && !stopInFlight && playbackSessionState === 'running'

  const handleSync = useCallback(async () => {
    window.electronAPI.startupMark('renderer:diagnostics-sync:start')
    setSyncing(true)
    try {
      if (config?.activationState === 'activated') {
        const revalidate = await window.electronAPI.revalidateDevice()
        if (
          revalidate.status === 'missing'
          || revalidate.status === 'unregistered'
        ) {
          setConfig(revalidate.config)
          setScreen('setup')
          return
        }
        // Apply refreshed config (zone/group names, etc.)
        setConfig(revalidate.config)
      }

      const release = await window.electronAPI.fetchRelease()
      if (release) {
        const manifest = await window.electronAPI.fetchManifest(
          release.release_id
        )
        usePlaybackStore.getState().setManifest(manifest)
      }

      // Refresh config from persistence so lastSyncAt is reflected in the UI
      const updatedConfig = await window.electronAPI.getConfig()
      setConfig(updatedConfig)
      const nextHealth = await window.electronAPI.getHealthStatus()
      setHealth(nextHealth)
      window.electronAPI.startupMark('renderer:diagnostics-sync:done')
    } catch (err) {
      useAppStore
        .getState()
        .addError(
          err instanceof Error ? err.message : 'Sync failed'
        )
      window.electronAPI.startupMark('renderer:diagnostics-sync:failed')
    } finally {
      setSyncing(false)
    }
  }, [config?.activationState, setConfig, setScreen])

  const refreshHealth = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.getHealthStatus()
      setHealth(snapshot)
    } catch {
      // Best-effort diagnostics poll
    }
  }, [])

  // Auto-sync on every launch when activated to refresh connectivity and schedule.
  useEffect(() => {
    if (config?.activationState === 'activated') {
      handleSync()
    }
  }, [config?.activationState, handleSync])

  useEffect(() => {
    void refreshHealth()
    const timer = setInterval(() => {
      void refreshHealth()
    }, 5000)
    return () => clearInterval(timer)
  }, [refreshHealth])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status Cards Row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Connection */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {effectiveConnection === 'connected' ? (
              <Wifi className="h-5 w-5 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className="text-sm font-medium">{t('diagnostics.connection')}</p>
              <Badge
                variant={
                  effectiveConnection === 'connected'
                    ? 'success'
                    : effectiveConnection === 'connecting'
                      ? 'warning'
                      : 'destructive'
                }
                className="mt-1"
              >
                {t(`connection.${effectiveConnection}`)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Playback */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Play className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{t('diagnostics.playback')}</p>
              <Badge variant={playbackBadgeVariant} className="mt-1">
                {playbackStatusLabel}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Displays */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{t('diagnostics.displays')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedDisplayIds.length} / {displays.length} {t('diagnostics.selected')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('diagnostics.deviceInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">{t('diagnostics.deviceId')}</span>
            <span className="truncate font-mono text-xs">
              {config?.deviceId ?? '—'}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.zone')}</span>
            <span className="font-mono text-xs">
              {config?.zoneName ?? '—'}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.group')}</span>
            <span className="font-mono text-xs">
              {config?.groupName ?? '—'}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.lastSync')}</span>
            <span className="text-xs">
              {formatTime(config?.lastSyncAt ?? null)}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.apiUrl')}</span>
            <span className="truncate font-mono text-xs">
              {config?.apiBaseUrl ?? '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Runtime Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runtime Health</CardTitle>
          <CardDescription>Live player telemetry and cache readiness</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Online</span>
            <span>
              <Badge variant={health?.online ? 'success' : 'destructive'}>
                {health?.online ? 'online' : 'offline'}
              </Badge>
            </span>
            <span className="text-muted-foreground">Backend / MQTT</span>
            <span className="font-mono text-xs">
              {health?.backend_status ?? '—'} / {health?.mqtt_status ?? '—'}
            </span>
            <span className="text-muted-foreground">Current release</span>
            <span className="font-mono text-xs">
              {health?.current_release_id ?? playbackState.releaseId ?? '—'}
            </span>
            <span className="text-muted-foreground">Playback status</span>
            <span>{playbackStatusLabel}</span>
            <span className="text-muted-foreground">Cache assets</span>
            <span className="font-mono text-xs">
              {health ? `${health.cache.available_assets}/${health.cache.total_assets}` : '—'}
            </span>
            <span className="text-muted-foreground">Cache missing</span>
            <span className="font-mono text-xs">
              {health?.cache.missing_assets ?? '—'}
            </span>
            <span className="text-muted-foreground">Heartbeat success</span>
            <span className="text-xs">
              {formatTime(health?.heartbeat.last_success_at ?? null)}
            </span>
            <span className="text-muted-foreground">Heartbeat attempt</span>
            <span className="text-xs">
              {formatTime(health?.heartbeat.last_attempt_at ?? null)}
            </span>
            <span className="text-muted-foreground">Last error</span>
            <span className="text-xs text-destructive/80">
              {health?.last_error ?? '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Current Playback */}
      {playbackState.currentSlot && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('diagnostics.nowPlaying')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">{t('diagnostics.slot')}</span>
              <span className="font-mono text-xs">
                {playbackState.currentSlot.slot_id}
              </span>
              <span className="text-muted-foreground">{t('diagnostics.asset')}</span>
              <span className="font-mono text-xs">
                {playbackState.currentAsset?.filename ?? '—'}
              </span>
              <span className="text-muted-foreground">{t('diagnostics.type')}</span>
              <span className="text-xs">
                {playbackState.currentAsset?.content_type ?? '—'}
              </span>
              <span className="text-muted-foreground">{t('diagnostics.ends')}</span>
              <span className="text-xs">
                {formatTime(playbackState.currentSlot.end_time)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSync} variant="outline" size="sm" disabled={syncing}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {t('diagnostics.syncNow')}
        </Button>
        <Button onClick={startPlayback} size="sm" disabled={!canStartPlayback}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {startInFlight ? t('diagnostics.starting') : t('diagnostics.startPlayback')}
        </Button>
        <Button
          onClick={stopPlayback}
          variant="secondary"
          size="sm"
          disabled={!canStopPlayback}
        >
          <Power className="mr-1.5 h-3.5 w-3.5" />
          {stopInFlight ? t('diagnostics.stopping') : t('diagnostics.stop')}
        </Button>
      </div>

      {/* Error Log */}
      {errors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              {t('diagnostics.recentErrors')}
            </CardTitle>
            <CardDescription>{t('diagnostics.lastErrors', { count: errors.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-32">
              <div className="space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="font-mono text-xs text-destructive/80">
                    {err}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
