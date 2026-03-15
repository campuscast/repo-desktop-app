import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/app-store'

const SHORTCUT_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')

export function SettingsScreen() {
  const config = useAppStore((s) => s.config)
  const [exitKey, setExitKey] = useState(config?.exitShortcutKey ?? 'Q')
  const [apiBaseUrl, setApiBaseUrl] = useState(config?.apiBaseUrl ?? '')
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState(config?.mqttBrokerUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setExitKey(config.exitShortcutKey)
      setApiBaseUrl(config.apiBaseUrl)
      setMqttBrokerUrl(config.mqttBrokerUrl)
    }
  }, [config])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      // Save shortcut key
      const updatedConfig = await window.electronAPI.setExitShortcut(exitKey)

      // Save URLs
      const finalConfig = await window.electronAPI.saveConfig({
        apiBaseUrl: apiBaseUrl.trim(),
        mqttBrokerUrl: mqttBrokerUrl.trim(),
      })

      useAppStore.getState().setConfig(finalConfig)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    exitKey !== (config?.exitShortcutKey ?? 'Q') ||
    apiBaseUrl.trim() !== (config?.apiBaseUrl ?? '') ||
    mqttBrokerUrl.trim() !== (config?.mqttBrokerUrl ?? '')

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Exit Shortcut */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exit Playback Shortcut</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Press this keyboard combination to exit fullscreen playback mode.
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs">
                Ctrl + Alt + Shift +
              </span>
              <select
                value={exitKey}
                onChange={(e) => setExitKey(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SHORTCUT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-api-url"
                className="text-xs font-medium text-muted-foreground"
              >
                API Base URL
              </label>
              <input
                id="settings-api-url"
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="settings-mqtt-url"
                className="text-xs font-medium text-muted-foreground"
              >
                MQTT Broker URL
              </label>
              <input
                id="settings-mqtt-url"
                type="text"
                value={mqttBrokerUrl}
                onChange={(e) => setMqttBrokerUrl(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          size="sm"
          disabled={saving || !hasChanges}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
