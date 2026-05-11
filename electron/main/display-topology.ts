import type { DisplayInfo } from '../shared/ipc-types'

function sortDisplays(displays: DisplayInfo[]): DisplayInfo[] {
  return [...displays].sort((left, right) => left.id.localeCompare(right.id))
}

export function buildDisplayTopologySignature(displays: DisplayInfo[]): string {
  return sortDisplays(displays)
    .map((display) =>
      [
        display.id,
        display.x,
        display.y,
        display.width,
        display.height,
        display.scaleFactor,
        display.rotation,
        display.isPrimary ? 1 : 0,
        display.internal ? 1 : 0,
      ].join(':')
    )
    .join('|')
}

export function hasMeaningfulDisplayTopologyChange(
  previous: DisplayInfo[],
  next: DisplayInfo[]
): boolean {
  return buildDisplayTopologySignature(previous) !== buildDisplayTopologySignature(next)
}
