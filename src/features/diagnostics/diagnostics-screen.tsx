import { useEffect, useState } from 'react'
import {
  Activity,
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
import { formatTime } from '@/lib/utils'

export function DiagnosticsScreen() {
  const config = useAppStore((s) => s.config)
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const errors = useAppStore((s) => s.errors)
  const playbackState = usePlaybackStore((s) => s.state)
  const { displays, selectedDisplayIds, startPlayback, stopPlayback } =
    useDisplays()
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      const release = await window.electronAPI.fetchRelease()
      if (release) {
        const manifest = await window.electronAPI.fetchManifest(
          release.release_id
        )
        usePlaybackStore.getState().setManifest(manifest)
      }
    } catch (err) {
      useAppStore
        .getState()
        .addError(
          err instanceof Error ? err.message : 'Sync failed'
        )
    } finally {
      setSyncing(false)
    }
  }

  // Auto-sync on mount if activated
  useEffect(() => {
    if (config?.activationState === 'activated' && !usePlaybackStore.getState().manifest) {
      handleSync()
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status Cards Row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Connection */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {connectionStatus.mqtt === 'connected' ? (
              <Wifi className="h-5 w-5 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className="text-sm font-medium">Connection</p>
              <Badge
                variant={
                  connectionStatus.mqtt === 'connected'
                    ? 'success'
                    : connectionStatus.mqtt === 'connecting'
                      ? 'warning'
                      : 'destructive'
                }
                className="mt-1"
              >
                {connectionStatus.mqtt}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Playback */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Play className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Playback</p>
              <Badge
                variant={
                  playbackState.status === 'playing'
                    ? 'success'
                    : playbackState.status === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                className="mt-1"
              >
                {playbackState.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Displays */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Displays</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedDisplayIds.length} of {displays.length} selected
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Device Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Device ID</span>
            <span className="truncate font-mono text-xs">
              {config?.deviceId ?? '—'}
            </span>
            <span className="text-muted-foreground">Zone</span>
            <span className="font-mono text-xs">
              {config?.zoneName ?? config?.zoneId ?? '—'}
            </span>
            <span className="text-muted-foreground">Group</span>
            <span className="font-mono text-xs">
              {config?.groupName ?? config?.groupId ?? '—'}
            </span>
            <span className="text-muted-foreground">Last Sync</span>
            <span className="text-xs">
              {formatTime(config?.lastSyncAt ?? null)}
            </span>
            <span className="text-muted-foreground">API URL</span>
            <span className="truncate font-mono text-xs">
              {config?.apiBaseUrl ?? '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Current Playback */}
      {playbackState.currentSlot && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Now Playing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Slot</span>
              <span className="font-mono text-xs">
                {playbackState.currentSlot.slot_id}
              </span>
              <span className="text-muted-foreground">Asset</span>
              <span className="font-mono text-xs">
                {playbackState.currentAsset?.filename ?? '—'}
              </span>
              <span className="text-muted-foreground">Type</span>
              <span className="text-xs">
                {playbackState.currentAsset?.content_type ?? '—'}
              </span>
              <span className="text-muted-foreground">Ends</span>
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
          Sync Now
        </Button>
        <Button onClick={startPlayback} size="sm">
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Start Playback
        </Button>
        <Button onClick={stopPlayback} variant="secondary" size="sm">
          <Power className="mr-1.5 h-3.5 w-3.5" />
          Stop
        </Button>
      </div>

      {/* Error Log */}
      {errors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              Recent Errors
            </CardTitle>
            <CardDescription>Last {errors.length} errors</CardDescription>
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
