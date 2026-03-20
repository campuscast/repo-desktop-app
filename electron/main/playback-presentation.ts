export type PresentationPlatform = NodeJS.Platform | string

export interface PresentationWindow {
  isDestroyed(): boolean
  isFullScreen(): boolean
  setFullScreen(flag: boolean): void
  isSimpleFullScreen?(): boolean
  setSimpleFullScreen?(flag: boolean): void
  isAlwaysOnTop(): boolean
  setAlwaysOnTop(flag: boolean, level?: string): void
  isMenuBarVisible(): boolean
  setMenuBarVisibility(visible: boolean): void
  isMenuBarAutoHide(): boolean
  setAutoHideMenuBar(hide: boolean): void
  isKiosk(): boolean
  setKiosk(flag: boolean): void
}

export interface PlaybackPresentationState {
  fullScreen: boolean
  simpleFullScreen: boolean
  alwaysOnTop: boolean
  menuBarVisible: boolean
  autoHideMenuBar: boolean
  kiosk: boolean
}

export function shouldUseKioskPresentation(platform: PresentationPlatform): boolean {
  return platform === 'win32' || platform === 'linux'
}

function getAlwaysOnTopLevel(platform: PresentationPlatform): string {
  return platform === 'darwin' ? 'floating' : 'screen-saver'
}

export function enterPlaybackPresentationMode(
  win: PresentationWindow,
  platform: PresentationPlatform = process.platform
): PlaybackPresentationState {
  const previousState: PlaybackPresentationState = {
    fullScreen: win.isFullScreen(),
    simpleFullScreen:
      typeof win.isSimpleFullScreen === 'function'
        ? win.isSimpleFullScreen()
        : false,
    alwaysOnTop: win.isAlwaysOnTop(),
    menuBarVisible: win.isMenuBarVisible(),
    autoHideMenuBar: win.isMenuBarAutoHide(),
    kiosk: win.isKiosk(),
  }

  if (win.isDestroyed()) {
    return previousState
  }

  win.setAutoHideMenuBar(true)
  win.setMenuBarVisibility(false)
  win.setAlwaysOnTop(true, getAlwaysOnTopLevel(platform))

  if (shouldUseKioskPresentation(platform)) {
    win.setKiosk(true)
  }

  if (platform === 'darwin' && typeof win.setSimpleFullScreen === 'function') {
    win.setSimpleFullScreen(true)
  }

  win.setFullScreen(true)
  return previousState
}

export function exitPlaybackPresentationMode(
  win: PresentationWindow,
  previousState: PlaybackPresentationState,
  platform: PresentationPlatform = process.platform
): void {
  if (win.isDestroyed()) return

  if (shouldUseKioskPresentation(platform)) {
    win.setKiosk(previousState.kiosk)
  }

  if (platform === 'darwin' && typeof win.setSimpleFullScreen === 'function') {
    win.setSimpleFullScreen(previousState.simpleFullScreen)
  }

  win.setFullScreen(previousState.fullScreen)
  win.setAlwaysOnTop(previousState.alwaysOnTop)
  win.setAutoHideMenuBar(previousState.autoHideMenuBar)
  win.setMenuBarVisibility(previousState.menuBarVisible)
}
