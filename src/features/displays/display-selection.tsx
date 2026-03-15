import { Monitor, Check, RefreshCw } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useDisplays } from '@/hooks/use-displays'
import { cn } from '@/lib/utils'

export function DisplaySelection() {
  const {
    displays,
    selectedDisplayIds,
    toggleDisplay,
    refreshDisplays,
  } = useDisplays()

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Display Management</h2>
          <p className="text-sm text-muted-foreground">
            Select displays for content playback
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshDisplays}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {displays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Monitor className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No displays detected
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {displays.map((display) => {
            const isSelected = selectedDisplayIds.includes(display.id)
            return (
              <Card
                key={display.id}
                className={cn(
                  'cursor-pointer transition-colors hover:border-primary/50',
                  isSelected && 'border-primary bg-primary/5'
                )}
                onClick={() => toggleDisplay(display.id)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Monitor className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{display.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {display.width} x {display.height}
                        {display.scaleFactor !== 1 &&
                          ` @ ${display.scaleFactor}x`}
                        {' · '}
                        Position ({display.x}, {display.y})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {display.isPrimary && (
                      <Badge variant="secondary">Primary</Badge>
                    )}
                    <Switch
                      checked={isSelected}
                      onCheckedChange={() => toggleDisplay(display.id)}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {selectedDisplayIds.length} display
        {selectedDisplayIds.length !== 1 ? 's' : ''} selected for playback.
        Each selected display will open a fullscreen playback window.
      </p>
    </div>
  )
}
