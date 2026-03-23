import { WifiOff } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { formatErrorForDisplay } from '@/lib/utils'
import { deriveEffectiveConnection } from '../../../electron/shared/connection-status'

export function OfflineBanner() {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const timeZone = useAppStore((s) => s.config?.timeZone ?? 'system')
  const effectiveConnection = deriveEffectiveConnection(connectionStatus)

  if (effectiveConnection !== 'disconnected') return null

  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-destructive/10 text-xs text-destructive">
      <WifiOff className="h-3.5 w-3.5" />
      <span>
        Connection lost — using cached content
        {connectionStatus.lastError && ` (${formatErrorForDisplay(connectionStatus.lastError, timeZone)})`}
      </span>
    </div>
  )
}
