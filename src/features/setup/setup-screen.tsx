import { useState } from 'react'
import { Monitor, ArrowRight, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/app-store'

/** First-run screen: enter Device ID and backend URL */
export function SetupScreen() {
  const config = useAppStore((s) => s.config)
  const setScreen = useAppStore((s) => s.setScreen)

  const [deviceId, setDeviceId] = useState(config?.deviceId ?? '')
  const [apiBaseUrl, setApiBaseUrl] = useState(
    config?.apiBaseUrl ?? 'http://localhost:3000/api/v1'
  )
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState(
    config?.mqttBrokerUrl ?? 'mqtt://localhost:1883'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedId = deviceId.trim()
    if (!trimmedId) {
      setError('Device ID is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const updated = await window.electronAPI.saveConfig({
        deviceId: trimmedId,
        apiBaseUrl: apiBaseUrl.trim(),
        mqttBrokerUrl: mqttBrokerUrl.trim(),
        activationState: 'pending',
      })
      useAppStore.getState().setConfig(updated)
      setScreen('activation')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save configuration'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Player Setup</CardTitle>
          <CardDescription>
            Enter the Device ID from CMS to begin activation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="deviceId"
                className="text-sm font-medium text-foreground"
              >
                Device ID
              </label>
              <input
                id="deviceId"
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="e.g. ABCD-EF23-GH45-JK67"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            <Separator />

            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Settings className="h-3.5 w-3.5" />
                Advanced Settings
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="apiUrl"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    API Base URL
                  </label>
                  <input
                    id="apiUrl"
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="mqttUrl"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    MQTT Broker URL
                  </label>
                  <input
                    id="mqttUrl"
                    type="text"
                    value={mqttBrokerUrl}
                    onChange={(e) => setMqttBrokerUrl(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </details>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Continue to Activation'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
