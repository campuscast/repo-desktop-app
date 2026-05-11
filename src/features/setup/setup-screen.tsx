import { useRef, useState } from 'react'
import { Monitor, ArrowRight, Settings, Globe, Sun, Moon } from 'lucide-react'
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
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import type { Locale, Theme } from '../../../electron/shared/ipc-types'

const SEGMENT_COUNT = 4
const SEGMENT_LENGTH = 4

const LOCALES: Array<{ value: Locale; label: string; flag: string }> = [
  { value: 'en', label: 'EN', flag: '🇬🇧' },
  { value: 'ru', label: 'RU', flag: '🇷🇺' },
]

function normalizeDeviceIdInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '')
    .slice(0, SEGMENT_COUNT * SEGMENT_LENGTH)
}

function splitDeviceId(value: string): string[] {
  const normalized = normalizeDeviceIdInput(value)
  return Array.from({ length: SEGMENT_COUNT }, (_, index) =>
    normalized.slice(index * SEGMENT_LENGTH, (index + 1) * SEGMENT_LENGTH)
  )
}

function joinDeviceId(segments: string[]): string {
  return segments.join('-')
}

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return theme
}

/** First-run screen: enter Device ID and backend URL */
export function SetupScreen() {
  const config = useAppStore((s) => s.config)
  const setScreen = useAppStore((s) => s.setScreen)
  const { t, locale, changeLocale } = useLocale()
  const { theme, changeTheme } = useTheme()

  const [deviceIdSegments, setDeviceIdSegments] = useState(() =>
    splitDeviceId(config?.deviceId ?? '')
  )
  const [apiBaseUrl, setApiBaseUrl] = useState(
    config?.apiBaseUrl ?? 'http://localhost:3000/api/v1'
  )
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState(
    config?.mqttBrokerUrl ?? 'mqtt://localhost:1883'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const segmentRefs = useRef<Array<HTMLInputElement | null>>([])
  const effectiveTheme = getEffectiveTheme(theme)

  function focusSegment(index: number) {
    const input = segmentRefs.current[index]
    if (!input) return
    input.focus()
    input.select()
  }

  function applySegmentsFromIndex(startIndex: number, rawValue: string) {
    const normalized = normalizeDeviceIdInput(rawValue)
    if (!normalized) return

    setDeviceIdSegments((prev) => {
      const next = [...prev]
      let cursor = startIndex
      for (let offset = 0; cursor < SEGMENT_COUNT; offset += SEGMENT_LENGTH) {
        const chunk = normalized.slice(offset, offset + SEGMENT_LENGTH)
        if (!chunk) break
        next[cursor] = chunk
        cursor += 1
      }
      return next
    })

    const consumedSegments = Math.max(
      1,
      Math.ceil(normalized.length / SEGMENT_LENGTH)
    )
    focusSegment(Math.min(startIndex + consumedSegments - 1, SEGMENT_COUNT - 1))
  }

  function applyFullDeviceId(rawValue: string) {
    const normalized = normalizeDeviceIdInput(rawValue)
    if (normalized.length !== SEGMENT_COUNT * SEGMENT_LENGTH) return false
    setDeviceIdSegments(splitDeviceId(normalized))
    setError(null)
    focusSegment(SEGMENT_COUNT - 1)
    return true
  }

  function handleSegmentChange(index: number, value: string) {
    const normalized = normalizeDeviceIdInput(value)
    setError(null)

    if (applyFullDeviceId(normalized)) {
      return
    }

    if (normalized.length > SEGMENT_LENGTH) {
      // If pasted content is longer than the remaining capacity in this segment,
      // treat it as a full Player ID and fill from the first segment.
      const remainingCapacity = (SEGMENT_COUNT - index) * SEGMENT_LENGTH
      const startIndex = normalized.length > remainingCapacity ? 0 : index
      applySegmentsFromIndex(startIndex, normalized)
      return
    }

    setDeviceIdSegments((prev) => {
      const next = [...prev]
      next[index] = normalized
      return next
    })

    if (normalized.length === SEGMENT_LENGTH && index < SEGMENT_COUNT - 1) {
      focusSegment(index + 1)
    }
  }

  function handleSegmentPaste(
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) {
    const pasted = event.clipboardData.getData('text')
    const normalized = normalizeDeviceIdInput(pasted)
    if (!normalized) return
    event.preventDefault()
    setError(null)
    if (applyFullDeviceId(normalized)) {
      return
    }
    const remainingCapacity = (SEGMENT_COUNT - index) * SEGMENT_LENGTH
    const startIndex = normalized.length > remainingCapacity ? 0 : index
    applySegmentsFromIndex(startIndex, normalized)
  }

  function handleSegmentKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    const target = event.currentTarget

    if (event.key === 'Backspace' && !target.value && index > 0) {
      event.preventDefault()
      setDeviceIdSegments((prev) => {
        const next = [...prev]
        next[index - 1] = next[index - 1].slice(0, -1)
        return next
      })
      focusSegment(index - 1)
      return
    }

    if (event.key === 'ArrowLeft' && target.selectionStart === 0 && index > 0) {
      event.preventDefault()
      focusSegment(index - 1)
      return
    }

    if (
      event.key === 'ArrowRight'
      && target.selectionStart === target.value.length
      && index < SEGMENT_COUNT - 1
    ) {
      event.preventDefault()
      focusSegment(index + 1)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const isComplete = deviceIdSegments.every(
      (segment) => segment.length === SEGMENT_LENGTH
    )
    if (!isComplete) {
      setError(t('setup.errorFormat'))
      return
    }
    const formattedDeviceId = joinDeviceId(deviceIdSegments)

    setSaving(true)
    setError(null)

    try {
      const updated = await window.electronAPI.saveConfig({
        deviceId: formattedDeviceId,
        deviceToken: null,
        mqttClientId: null,
        mqttTopicPrefix: null,
        tokenExpiresAt: null,
        apiBaseUrl: apiBaseUrl.trim(),
        mqttBrokerUrl: mqttBrokerUrl.trim(),
        activationState: 'pending',
        lastSyncAt: null,
        zoneId: null,
        groupId: null,
        zoneName: null,
        groupName: null,
        pendingActivationCode: null,
        pendingActivationRequestedAt: null,
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
    <div className="flex h-full w-full items-center justify-center bg-background p-8">
      {/* Language Switcher — top-right corner */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          onClick={() => changeTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
          className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t('setup.toggleTheme')}
          aria-label={t('setup.toggleTheme')}
        >
          {effectiveTheme === 'dark' ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {LOCALES.map((loc) => (
          <button
            key={loc.value}
            onClick={() => changeLocale(loc.value)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              locale === loc.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {loc.flag} {loc.label}
          </button>
        ))}
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t('setup.title')}</CardTitle>
          <CardDescription>
            {t('setup.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="deviceId-segment-1"
                className="text-sm font-medium text-foreground"
              >
                {t('setup.playerId')}
              </label>
              <div className="flex items-center justify-between gap-2">
                {deviceIdSegments.map((segment, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      id={`deviceId-segment-${index + 1}`}
                      ref={(el) => {
                        segmentRefs.current[index] = el
                      }}
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      value={segment}
                      onChange={(e) => handleSegmentChange(index, e.target.value)}
                      onPaste={(e) => handleSegmentPaste(index, e)}
                      onKeyDown={(e) => handleSegmentKeyDown(index, e)}
                      maxLength={SEGMENT_LENGTH}
                      className="h-12 w-20 rounded-lg border border-input bg-background px-2 text-center font-mono text-lg tracking-[0.25em] text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="ABCD"
                      aria-label={`Player ID segment ${index + 1}`}
                      autoFocus={index === 0}
                    />
                    {index < SEGMENT_COUNT - 1 && (
                      <span
                        aria-hidden
                        className="font-mono text-lg font-semibold text-muted-foreground"
                      >
                        -
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('setup.playerIdHint')}
              </p>
            </div>

            <Separator />

            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Settings className="h-3.5 w-3.5" />
                {t('setup.advancedSettings')}
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="apiUrl"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {t('setup.apiBaseUrl')}
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
                    {t('setup.mqttBrokerUrl')}
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
              {saving ? t('setup.saving') : t('setup.continue')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
