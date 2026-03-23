import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Save,
  Pencil,
  X,
  Globe,
  Clock,
  Sun,
  Moon,
  Monitor,
  Power,
  HardDrive,
  Trash2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/store/app-store'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import type { CacheInfo, Locale, Theme } from '../../../electron/shared/ipc-types'

// ─── Shortcut Recorder helpers ─────────────────────────────────────────────

/** Map browser KeyboardEvent keys → Electron accelerator modifier names */
function eventToAccelerator(e: KeyboardEvent): string | null {
  const modifiers: string[] = []
  if (e.ctrlKey || e.metaKey) modifiers.push('CmdOrCtrl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  // Ignore if only modifier keys pressed
  const MODIFIER_CODES = new Set([
    'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
    'CapsLock', 'NumLock', 'ScrollLock',
  ])
  if (MODIFIER_CODES.has(e.code)) return null

  if (modifiers.length === 0) return null // Must have at least one modifier

  // Map common key names
  let key = ''
  if (e.code.startsWith('Key')) {
    key = e.code.slice(3) // KeyA → A
  } else if (e.code.startsWith('Digit')) {
    key = e.code.slice(5) // Digit1 → 1
  } else if (e.code.startsWith('Numpad')) {
    key = `num${e.code.slice(6)}` // Numpad1 → num1
  } else if (e.code === 'Space') {
    key = 'Space'
  } else if (e.code === 'Escape') {
    return 'CANCEL'
  } else {
    // Use standard key names: F1-F24, Tab, Enter, Backspace, Delete, etc.
    const STANDARD_KEYS: Record<string, string> = {
      Tab: 'Tab', Enter: 'Return', Backspace: 'Backspace',
      Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
      F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
      F13: 'F13', F14: 'F14', F15: 'F15', F16: 'F16', F17: 'F17', F18: 'F18',
      F19: 'F19', F20: 'F20', F21: 'F21', F22: 'F22', F23: 'F23', F24: 'F24',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
      Period: '.', Slash: '/', Backquote: '`',
    }
    key = STANDARD_KEYS[e.code] ?? STANDARD_KEYS[e.key] ?? ''
  }

  if (!key) return null

  return [...modifiers, key].join('+')
}

/** Convert Electron accelerator string to human-readable display */
function formatAccelerator(accelerator: string): string {
  const isMac = navigator.userAgent.includes('Mac')
  return accelerator
    .replace(/CmdOrCtrl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Ctrl/g, isMac ? '⌃' : 'Ctrl')
    .replace(/Control/g, isMac ? '⌃' : 'Ctrl')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Option/g, '⌥')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/\+/g, ' + ')
}

// ─── Language selector ──────────────────────────────────────────────────────

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
]

// ─── Theme options ──────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{ value: Theme; icon: React.ElementType; labelKey: string }> = [
  { value: 'light', icon: Sun, labelKey: 'settings.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'settings.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'settings.themeSystem' },
]

const SYSTEM_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const TIME_ZONE_OPTIONS = [
  'UTC',
  SYSTEM_TIME_ZONE,
  'Europe/Moscow',
  'Europe/London',
  'Asia/Dubai',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
].filter((value, index, self) => self.indexOf(value) === index)

function formatBytes(value: number): string {
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / Math.pow(1024, exponent)
  return `${normalized >= 10 ? normalized.toFixed(0) : normalized.toFixed(1)} ${units[exponent]}`
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const config = useAppStore((s) => s.config)
  const { t, locale, changeLocale } = useLocale()
  const { theme, changeTheme } = useTheme()

  // Shortcut state
  const currentAccelerator = config?.exitShortcutAccelerator || `Ctrl+Alt+Shift+${config?.exitShortcutKey ?? 'Q'}`
  const [recording, setRecording] = useState(false)
  const [pendingAccelerator, setPendingAccelerator] = useState<string | null>(null)
  const [recordingDisplay, setRecordingDisplay] = useState('')
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const recorderRef = useRef<HTMLDivElement>(null)

  // URL state
  const [apiBaseUrl, setApiBaseUrl] = useState(config?.apiBaseUrl ?? '')
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState(config?.mqttBrokerUrl ?? '')
  const [timeZone, setTimeZone] = useState(config?.timeZone ?? 'system')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(
    config?.autoLaunchEnabled ?? false
  )
  const [autoLaunchSupported, setAutoLaunchSupported] = useState(true)
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(true)
  const [autoLaunchSaving, setAutoLaunchSaving] = useState(false)
  const [autoLaunchError, setAutoLaunchError] = useState<string | null>(null)
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)
  const [cacheLoading, setCacheLoading] = useState(true)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [cacheMessage, setCacheMessage] = useState<string | null>(null)

  useEffect(() => {
    if (config) {
      setApiBaseUrl(config.apiBaseUrl)
      setMqttBrokerUrl(config.mqttBrokerUrl)
      setTimeZone(config.timeZone ?? 'system')
      setAutoLaunchEnabled(config.autoLaunchEnabled)
    }
  }, [config])

  useEffect(() => {
    let mounted = true

    window.electronAPI
      .getAutoLaunchSettings()
      .then((settings) => {
        if (!mounted) return
        setAutoLaunchEnabled(settings.enabled)
        setAutoLaunchSupported(settings.supported)
      })
      .catch(() => {
        if (!mounted) return
        setAutoLaunchError(t('settings.autoLaunchError'))
      })
      .finally(() => {
        if (mounted) {
          setAutoLaunchLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [t])

  const loadCacheInfo = useCallback(async () => {
    try {
      const info = await window.electronAPI.getCacheInfo()
      setCacheInfo(info)
    } catch {
      setCacheMessage(t('settings.cacheLoadError'))
    } finally {
      setCacheLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadCacheInfo()
  }, [loadCacheInfo])

  // ─── Shortcut recording ────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const accelerator = eventToAccelerator(e)
    if (!accelerator) return

    if (accelerator === 'CANCEL') {
      setRecording(false)
      setPendingAccelerator(null)
      setRecordingDisplay('')
      setShortcutError(null)
      return
    }

    setRecordingDisplay(formatAccelerator(accelerator))
    setPendingAccelerator(accelerator)
    setShortcutError(null)

    // Validate on main process
    window.electronAPI.validateShortcut(accelerator).then((result) => {
      if (!result.valid) {
        setShortcutError(result.reason ?? 'Invalid shortcut')
        setPendingAccelerator(null)
      }
    })
  }, [])

  useEffect(() => {
    if (recording) {
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recording, handleKeyDown])

  function startRecording() {
    setRecording(true)
    setPendingAccelerator(null)
    setRecordingDisplay('')
    setShortcutError(null)
  }

  async function confirmShortcut() {
    if (!pendingAccelerator) return
    try {
      const updated = await window.electronAPI.setExitShortcut(pendingAccelerator)
      useAppStore.getState().setConfig(updated)
    } catch {
      setShortcutError('Failed to save shortcut')
    }
    setRecording(false)
    setPendingAccelerator(null)
    setRecordingDisplay('')
  }

  function cancelRecording() {
    setRecording(false)
    setPendingAccelerator(null)
    setRecordingDisplay('')
    setShortcutError(null)
  }

  // ─── Settings save ─────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const finalConfig = await window.electronAPI.saveConfig({
        apiBaseUrl: apiBaseUrl.trim(),
        mqttBrokerUrl: mqttBrokerUrl.trim(),
        timeZone,
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

  const hasSettingsChanges =
    apiBaseUrl.trim() !== (config?.apiBaseUrl ?? '') ||
    mqttBrokerUrl.trim() !== (config?.mqttBrokerUrl ?? '') ||
    timeZone !== (config?.timeZone ?? 'system')

  async function handleAutoLaunchToggle(enabled: boolean) {
    setAutoLaunchSaving(true)
    setAutoLaunchError(null)
    try {
      const status = await window.electronAPI.setAutoLaunchEnabled(enabled)
      setAutoLaunchEnabled(status.enabled)
      setAutoLaunchSupported(status.supported)
      const updatedConfig = await window.electronAPI.getConfig()
      useAppStore.getState().setConfig(updatedConfig)
    } catch {
      setAutoLaunchError(t('settings.autoLaunchError'))
    } finally {
      setAutoLaunchSaving(false)
    }
  }

  async function handleClearCache() {
    const confirmed = window.confirm(t('settings.cacheClearConfirm'))
    if (!confirmed) return

    setCacheClearing(true)
    setCacheMessage(null)
    try {
      const result = await window.electronAPI.clearCache()
      await loadCacheInfo()
      const summary = t('settings.cacheClearSummary', {
        files: result.media_files_removed,
        size: formatBytes(result.bytes_reclaimed),
      })
      if (result.media_files_failed > 0) {
        setCacheMessage(
          `${summary} ${t('settings.cacheClearPartial', {
            failed: result.media_files_failed,
          })}`
        )
      } else {
        setCacheMessage(summary)
      }
    } catch {
      setCacheMessage(t('settings.cacheClearError'))
    } finally {
      setCacheClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Exit Shortcut */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.exitShortcut')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.exitShortcutDesc')}
            </p>

            {!recording ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {formatAccelerator(currentAccelerator).split(' + ').map((part, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                      <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
                        {part}
                      </Badge>
                    </span>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={startRecording}>
                  <Pencil className="mr-1.5 h-3 w-3" />
                  {t('settings.edit')}
                </Button>
              </div>
            ) : (
              <div ref={recorderRef} className="space-y-2">
                <div className="flex h-12 items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-4">
                  {recordingDisplay ? (
                    <span className="font-mono text-sm font-medium text-primary">
                      {recordingDisplay}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground animate-pulse">
                      {t('settings.pressKeys')}
                    </span>
                  )}
                </div>
                {shortcutError && (
                  <p className="text-xs text-destructive">{shortcutError}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {t('settings.pressEscCancel')}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={confirmShortcut}
                    disabled={!pendingAccelerator}
                  >
                    {t('settings.save')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelRecording}>
                    <X className="mr-1 h-3 w-3" />
                    {t('settings.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('settings.language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t('settings.languageDesc')}
          </p>
          <div className="flex gap-2">
            {LOCALES.map((loc) => (
              <Button
                key={loc.value}
                variant={locale === loc.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => changeLocale(loc.value)}
              >
                {loc.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-4 w-4" />
            {t('settings.theme')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t('settings.themeDesc')}
          </p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon
              return (
                <Button
                  key={opt.value}
                  variant={theme === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => changeTheme(opt.value)}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {t(opt.labelKey)}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Time zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('settings.timeZone')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t('settings.timeZoneDesc')}
          </p>
          <select
            id="settings-time-zone"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="system">
              {t('settings.timeZoneSystem', { name: SYSTEM_TIME_ZONE })}
            </option>
            {TIME_ZONE_OPTIONS.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Auto Launch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Power className="h-4 w-4" />
            {t('settings.autoLaunch')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t('settings.autoLaunchDesc')}
              </p>
              {!autoLaunchSupported && (
                <p className="text-xs text-muted-foreground">
                  {t('settings.autoLaunchUnsupported')}
                </p>
              )}
              {autoLaunchError && (
                <p className="text-xs text-destructive">{autoLaunchError}</p>
              )}
            </div>
            <Switch
              checked={autoLaunchEnabled}
              onCheckedChange={handleAutoLaunchToggle}
              disabled={!autoLaunchSupported || autoLaunchLoading || autoLaunchSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cache Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t('settings.cacheTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.cacheDesc')}
            </p>
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">{t('settings.cacheFiles')}</span>
              <span className="font-mono">
                {cacheLoading ? '—' : cacheInfo?.media_files ?? 0}
              </span>
              <span className="text-muted-foreground">{t('settings.cacheSize')}</span>
              <span className="font-mono">
                {cacheLoading ? '—' : formatBytes(cacheInfo?.total_bytes ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.cacheImpact')}
            </p>
            {cacheMessage && (
              <p className="text-xs text-muted-foreground">{cacheMessage}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={cacheClearing || cacheLoading}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {cacheClearing ? t('settings.cacheClearing') : t('settings.clearCache')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connection Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.connection')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-api-url"
                className="text-xs font-medium text-muted-foreground"
              >
                {t('settings.apiBaseUrl')}
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
                {t('settings.mqttBrokerUrl')}
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
          disabled={saving || !hasSettingsChanges}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.saveSettings')}
        </Button>
      </div>
    </div>
  )
}
