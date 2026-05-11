import { Loader2, Monitor } from 'lucide-react'

export function BootScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background">
      <div className="flex items-center gap-3">
        <Monitor className="h-10 w-10 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          CampusCast
        </h1>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Initializing player...</span>
      </div>
    </div>
  )
}
