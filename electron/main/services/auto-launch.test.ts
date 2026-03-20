import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildLinuxDesktopEntry,
  isLinuxAutostartDesktopEntry,
} from './auto-launch-linux.js'

describe('linux autostart desktop entry', () => {
  it('generates xdg-compliant desktop file with explicit autostart arg', () => {
    const entry = buildLinuxDesktopEntry(
      '/opt/CampusCast Player/CampusCast Player.AppImage',
      '--autostart'
    )

    assert.match(entry, /\[Desktop Entry\]/)
    assert.match(entry, /Type=Application/)
    assert.match(entry, /Name=CampusCast Player/)
    assert.match(entry, /Terminal=false/)
    assert.match(entry, /X-GNOME-Autostart-enabled=true/)
    assert.match(entry, /X-CampusCast-AutoLaunch=true/)
    assert.match(
      entry,
      /Exec="\/opt\/CampusCast Player\/CampusCast Player\.AppImage" --autostart/
    )
    assert.doesNotMatch(entry, /^\s*TryExec=/m)
    assert.equal(isLinuxAutostartDesktopEntry(entry, '--autostart'), true)
  })

  it('treats hidden autostart entries as disabled', () => {
    const hiddenEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Exec="/tmp/app" --autostart',
      'Hidden=true',
      'X-CampusCast-AutoLaunch=true',
      '',
    ].join('\n')

    assert.equal(isLinuxAutostartDesktopEntry(hiddenEntry, '--autostart'), false)
  })
})
