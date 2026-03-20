import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from './store/app-store'
import { usePlaybackStore } from './store/playback-store'
import { useIpcEvents } from './hooks/use-ipc'
import { initLocale } from './hooks/use-locale'
import { initTheme } from './hooks/use-theme'
import { BootScreen } from './features/boot/boot-screen'
import { SetupScreen } from './features/setup/setup-screen'
import { ActivationScreen } from './features/activation/activation-screen'
import { ControlShell } from './components/layout/control-shell'
import { PlaybackScreen } from './features/playback/playback-screen'
import type { WindowMode } from '../electron/shared/ipc-types'

export function App() {
  const [windowMode, setWindowMode] = useState<WindowMode | null>(null)
  const [displayId, setDisplayId] = useState<string | null>(null)

  // Determine window mode on mount
  useEffect(() => {
    window.electronAPI.startupMark('renderer:window-mode:resolve:start')
    Promise.all([
      window.electronAPI.getWindowMode(),
      window.electronAPI.getPlaybackDisplayId(),
    ]).then(([mode, playbackDisplayId]) => {
      setWindowMode(mode)
      setDisplayId(playbackDisplayId)
      window.electronAPI.startupMark('renderer:window-mode:resolve:done', `mode=${mode}`)
    })
  }, [])

  if (windowMode === null) {
    return <BootScreen />
  }

  if (windowMode === 'playback') {
    return <PlaybackScreen displayId={displayId} />
  }

  return <ControlApp />
}

function ControlApp() {
  const screen = useAppStore((s) => s.screen)
  const setScreen = useAppStore((s) => s.setScreen)
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setDisplays = useAppStore((s) => s.setDisplays)
  const [booted, setBooted] = useState(false)
  const setManifest = usePlaybackStore((s) => s.setManifest)
  const evaluateSchedule = usePlaybackStore((s) => s.evaluateSchedule)

  // Register IPC event listeners
  useIpcEvents()

  // Boot: load config from persistence
  useEffect(() => {
    async function boot() {
      window.electronAPI.startupMark('renderer:control-boot:start')
      try {
        const [config, displays] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getDisplays(),
        ])
        setConfig(config)
        window.electronAPI.startupMark('renderer:control-boot:config-loaded')

        // Initialize locale and theme from persisted config
        initLocale(config.locale ?? 'en')
        initTheme(config.theme ?? 'dark')

        setDisplays(displays)
        window.electronAPI.startupMark('renderer:control-boot:displays-loaded')

        // Determine starting screen
        if (!config.deviceId) {
          setScreen('setup')
          window.electronAPI.startupMark('renderer:first-usable-ui', 'screen=setup')
        } else if (config.activationState !== 'activated') {
          setScreen('activation')
          window.electronAPI.startupMark('renderer:first-usable-ui', 'screen=activation')
        } else {
          setScreen('diagnostics')
          window.electronAPI.startupMark('renderer:first-usable-ui', 'screen=diagnostics')
        }
      } catch (err) {
        console.error('Boot failed:', err)
        setScreen('setup')
        window.electronAPI.startupMark('renderer:first-usable-ui', 'screen=setup(fallback)')
      }
      setBooted(true)
      window.electronAPI.startupMark('renderer:control-boot:done')
    }
    boot()
  }, [setConfig, setDisplays, setScreen])

  // Background activation revalidation so removed devices are sent back to setup.
  useEffect(() => {
    if (!booted || config?.activationState !== 'activated') return

    let cancelled = false
    const verify = async () => {
      try {
        const result = await window.electronAPI.revalidateDevice()
        if (cancelled) return
        if (
          result.status === 'missing'
          || result.status === 'unregistered'
        ) {
          setConfig(result.config)
          setScreen('setup')
        } else {
          setConfig(result.config)
        }
      } catch {
        // Best-effort background check
      }
    }

    void verify()
    const timer = setInterval(() => {
      void verify()
    }, 30_000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [booted, config?.activationState, setConfig, setScreen])

  // Any transition back to onboarding must hard-stop playback windows.
  useEffect(() => {
    if (!booted) return
    if (screen !== 'setup' && screen !== 'activation') return

    let cancelled = false
    const stopPlayback = async () => {
      try {
        await window.electronAPI.closePlaybackWindows()
      } catch {
        // Best-effort forced stop
      }
      if (cancelled) return
      setManifest(null)
      evaluateSchedule()
    }

    void stopPlayback()
    return () => {
      cancelled = true
    }
  }, [booted, screen, setManifest, evaluateSchedule])

  if (!booted) {
    return <BootScreen />
  }

  return (
    <>
      {screen === 'boot' && <BootScreen />}
      {screen === 'setup' && (
        <div key="setup" className="animate-screen-enter">
          <SetupScreen />
        </div>
      )}
      {screen === 'activation' && (
        <div key="activation" className="animate-screen-enter">
          <ActivationScreen />
        </div>
      )}
      {(screen === 'diagnostics' ||
        screen === 'displays' ||
        screen === 'settings') && (
        <div key="control" className="animate-screen-enter">
          <ControlShell />
        </div>
      )}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'bg-card text-card-foreground border-border',
        }}
      />
    </>
  )
}
