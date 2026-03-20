import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  enterPlaybackPresentationMode,
  exitPlaybackPresentationMode,
  shouldUseKioskPresentation,
  type PlaybackPresentationState,
  type PresentationWindow,
} from './playback-presentation.js'

class FakeWindow implements PresentationWindow {
  private destroyed = false
  private fullScreen = false
  private simpleFullScreen = false
  private alwaysOnTop = false
  private menuBarVisible = true
  private autoHideMenuBar = false
  private kiosk = false
  readonly calls: string[] = []

  constructor(initial?: Partial<PlaybackPresentationState>) {
    if (initial) {
      this.fullScreen = initial.fullScreen ?? this.fullScreen
      this.simpleFullScreen = initial.simpleFullScreen ?? this.simpleFullScreen
      this.alwaysOnTop = initial.alwaysOnTop ?? this.alwaysOnTop
      this.menuBarVisible = initial.menuBarVisible ?? this.menuBarVisible
      this.autoHideMenuBar = initial.autoHideMenuBar ?? this.autoHideMenuBar
      this.kiosk = initial.kiosk ?? this.kiosk
    }
  }

  setDestroyed(flag: boolean): void {
    this.destroyed = flag
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isFullScreen(): boolean {
    return this.fullScreen
  }

  setFullScreen(flag: boolean): void {
    this.calls.push(`setFullScreen:${flag}`)
    this.fullScreen = flag
  }

  isSimpleFullScreen(): boolean {
    return this.simpleFullScreen
  }

  setSimpleFullScreen(flag: boolean): void {
    this.calls.push(`setSimpleFullScreen:${flag}`)
    this.simpleFullScreen = flag
  }

  isAlwaysOnTop(): boolean {
    return this.alwaysOnTop
  }

  setAlwaysOnTop(flag: boolean, level?: string): void {
    this.calls.push(`setAlwaysOnTop:${flag}:${level ?? ''}`)
    this.alwaysOnTop = flag
  }

  isMenuBarVisible(): boolean {
    return this.menuBarVisible
  }

  setMenuBarVisibility(visible: boolean): void {
    this.calls.push(`setMenuBarVisibility:${visible}`)
    this.menuBarVisible = visible
  }

  isMenuBarAutoHide(): boolean {
    return this.autoHideMenuBar
  }

  setAutoHideMenuBar(hide: boolean): void {
    this.calls.push(`setAutoHideMenuBar:${hide}`)
    this.autoHideMenuBar = hide
  }

  isKiosk(): boolean {
    return this.kiosk
  }

  setKiosk(flag: boolean): void {
    this.calls.push(`setKiosk:${flag}`)
    this.kiosk = flag
  }
}

describe('playback presentation mode', () => {
  it('uses kiosk presentation only on Windows and Linux', () => {
    assert.equal(shouldUseKioskPresentation('win32'), true)
    assert.equal(shouldUseKioskPresentation('linux'), true)
    assert.equal(shouldUseKioskPresentation('darwin'), false)
  })

  it('enters Windows presentation mode with kiosk and fullscreen', () => {
    const win = new FakeWindow()
    const previous = enterPlaybackPresentationMode(win, 'win32')

    assert.deepEqual(previous, {
      fullScreen: false,
      simpleFullScreen: false,
      alwaysOnTop: false,
      menuBarVisible: true,
      autoHideMenuBar: false,
      kiosk: false,
    })
    assert.deepEqual(win.calls, [
      'setAutoHideMenuBar:true',
      'setMenuBarVisibility:false',
      'setAlwaysOnTop:true:screen-saver',
      'setKiosk:true',
      'setFullScreen:true',
    ])
    assert.equal(win.isKiosk(), true)
    assert.equal(win.isFullScreen(), true)
  })

  it('keeps macOS on fullscreen path without kiosk', () => {
    const win = new FakeWindow()
    enterPlaybackPresentationMode(win, 'darwin')

    assert.equal(win.calls.includes('setKiosk:true'), false)
    assert.equal(win.calls.includes('setSimpleFullScreen:true'), true)
    assert.equal(win.calls.includes('setAlwaysOnTop:true:floating'), true)
    assert.equal(win.isFullScreen(), true)
  })

  it('restores previous state on exit', () => {
    const initial: PlaybackPresentationState = {
      fullScreen: false,
      simpleFullScreen: false,
      alwaysOnTop: false,
      menuBarVisible: true,
      autoHideMenuBar: false,
      kiosk: false,
    }
    const win = new FakeWindow(initial)
    const previous = enterPlaybackPresentationMode(win, 'linux')

    win.calls.length = 0
    exitPlaybackPresentationMode(win, previous, 'linux')

    assert.deepEqual(win.calls, [
      'setKiosk:false',
      'setFullScreen:false',
      'setAlwaysOnTop:false:',
      'setAutoHideMenuBar:false',
      'setMenuBarVisibility:true',
    ])
    assert.equal(win.isKiosk(), false)
    assert.equal(win.isFullScreen(), false)
    assert.equal(win.isAlwaysOnTop(), false)
    assert.equal(win.isMenuBarVisible(), true)
    assert.equal(win.isMenuBarAutoHide(), false)
  })

  it('no-ops when the window is already destroyed', () => {
    const win = new FakeWindow()
    win.setDestroyed(true)

    const previous = enterPlaybackPresentationMode(win, 'win32')
    exitPlaybackPresentationMode(win, previous, 'win32')

    assert.deepEqual(previous, {
      fullScreen: false,
      simpleFullScreen: false,
      alwaysOnTop: false,
      menuBarVisible: true,
      autoHideMenuBar: false,
      kiosk: false,
    })
    assert.deepEqual(win.calls, [])
  })
})
