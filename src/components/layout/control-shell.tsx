import { Monitor, Activity, LayoutGrid, Settings, Power } from 'lucide-react'
import { useAppStore, type AppScreen } from '@/store/app-store'
import { DiagnosticsScreen } from '@/features/diagnostics/diagnostics-screen'
import { DisplaySelection } from '@/features/displays/display-selection'
import { OfflineBanner } from '@/features/offline/offline-banner'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const NAV_ITEMS: Array<{
  id: AppScreen
  label: string
  icon: React.ElementType
}> = [
  { id: 'diagnostics', label: 'Status', icon: Activity },
  { id: 'displays', label: 'Displays', icon: LayoutGrid },
]

export function ControlShell() {
  const screen = useAppStore((s) => s.screen)
  const setScreen = useAppStore((s) => s.setScreen)
  const config = useAppStore((s) => s.config)
  const connectionStatus = useAppStore((s) => s.connectionStatus)

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Offline Banner */}
      <OfflineBanner />

      {/* Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2.5">
          <Monitor className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">CampusCast Player</span>
          <Badge variant="secondary" className="text-[10px]">
            {config?.activationState ?? 'unknown'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connectionStatus.mqtt === 'connected'
                ? 'bg-success'
                : connectionStatus.mqtt === 'connecting'
                  ? 'bg-warning animate-pulse'
                  : 'bg-destructive'
            )}
          />
          <span className="text-xs text-muted-foreground">
            {connectionStatus.mqtt}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-border bg-card/50 p-2">
          <div className="flex flex-1 flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = screen === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <Separator className="my-2" />

          <div className="px-3 py-1.5">
            <p className="truncate text-[10px] text-muted-foreground">
              {config?.deviceId?.slice(0, 18)}...
            </p>
          </div>
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {screen === 'diagnostics' && <DiagnosticsScreen />}
          {screen === 'displays' && <DisplaySelection />}
        </main>
      </div>
    </div>
  )
}
