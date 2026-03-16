import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from './store/app-store'
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
    window.electronAPI.getWindowMode().then(setWindowMode)
    window.electronAPI.getPlaybackDisplayId().then(setDisplayId)
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
  const setConfig = useAppStore((s) => s.setConfig)
  const setDisplays = useAppStore((s) => s.setDisplays)
  const [booted, setBooted] = useState(false)

  // Register IPC event listeners
  useIpcEvents()

  // Boot: load config from persistence
  useEffect(() => {
    async function boot() {
      try {
        const config = await window.electronAPI.getConfig()
        setConfig(config)

        // Initialize locale and theme from persisted config
        initLocale(config.locale ?? 'en')
        initTheme(config.theme ?? 'dark')

        const displays = await window.electronAPI.getDisplays()
        setDisplays(displays)

        // Determine starting screen
        if (!config.deviceId) {
          setScreen('setup')
        } else if (config.activationState !== 'activated') {
          setScreen('activation')
        } else {
          setScreen('diagnostics')
        }
      } catch (err) {
        console.error('Boot failed:', err)
        setScreen('setup')
      }
      setBooted(true)
    }
    boot()
  }, [setConfig, setDisplays, setScreen])

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
