import { join } from 'node:path'

export const LINUX_AUTOSTART_FILENAME = 'campuscast-player.desktop'
export const LINUX_AUTOSTART_MARKER = 'X-CampusCast-AutoLaunch=true'

export function getLinuxAutostartDir(
  homeDir: string,
  xdgConfigHome?: string
): string {
  const normalizedXdgHome = xdgConfigHome?.trim()
  if (normalizedXdgHome) {
    return join(normalizedXdgHome, 'autostart')
  }
  return join(homeDir, '.config', 'autostart')
}

export function buildLinuxDesktopEntry(
  execPath: string,
  autoLaunchArg: string
): string {
  const execField = `${quoteDesktopExecArg(execPath)} ${autoLaunchArg}`

  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=CampusCast Player',
    'Comment=CampusCast digital signage player',
    `Exec=${execField}`,
    'Terminal=false',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    'Hidden=false',
    LINUX_AUTOSTART_MARKER,
    '',
  ].join('\n')
}

export function isLinuxAutostartDesktopEntry(
  content: string,
  autoLaunchArg: string
): boolean {
  const hidden = /^\s*Hidden\s*=\s*true\s*$/im.test(content)
  if (hidden) return false

  return (
    content.includes(LINUX_AUTOSTART_MARKER)
    && /^\s*Type\s*=\s*Application\s*$/im.test(content)
    && /^\s*Exec\s*=.+$/im.test(content)
    && content.includes(autoLaunchArg)
  )
}

function quoteDesktopExecArg(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('`', '\\`')
    .replaceAll('$', '\\$')
  return `"${escaped}"`
}
