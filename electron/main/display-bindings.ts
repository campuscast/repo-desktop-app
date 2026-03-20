import type {
  AppConfig,
  DisplayInfo,
  PersistedDisplayBinding,
} from '../shared/ipc-types'

interface DisplaySelectionConfig {
  selectedDisplayIds: string[]
  selectedDisplayBindings: PersistedDisplayBinding[]
}

interface ScoredCandidate {
  display: DisplayInfo
  score: number
}

export interface ResolveDisplaysResult {
  selectedDisplays: DisplayInfo[]
  diagnostics: string[]
  usedFallback: boolean
}

const EPSILON = 0.001

export function createDisplayBinding(display: DisplayInfo): PersistedDisplayBinding {
  return {
    id: display.id,
    label: display.label,
    isPrimary: display.isPrimary,
    width: display.width,
    height: display.height,
    x: display.x,
    y: display.y,
    workAreaX: display.workAreaX,
    workAreaY: display.workAreaY,
    workAreaWidth: display.workAreaWidth,
    workAreaHeight: display.workAreaHeight,
    scaleFactor: display.scaleFactor,
    internal: display.internal,
    rotation: display.rotation,
    capturedAt: new Date().toISOString(),
  }
}

export function deriveDisplayBindings(
  selectedDisplayIds: string[],
  allDisplays: DisplayInfo[]
): PersistedDisplayBinding[] {
  const byId = new Map(allDisplays.map((d) => [d.id, d]))
  const bindings: PersistedDisplayBinding[] = []

  for (const id of selectedDisplayIds) {
    const display = byId.get(id)
    if (!display) continue
    bindings.push(createDisplayBinding(display))
  }

  return bindings
}

export function resolveDisplaysForPlayback(
  config: Pick<AppConfig, 'selectedDisplayIds' | 'selectedDisplayBindings'>,
  allDisplays: DisplayInfo[]
): ResolveDisplaysResult {
  const diagnostics: string[] = []
  const usedIds = new Set<string>()
  const assignments = new Map<number, DisplayInfo>()
  let usedFallback = false

  const orderedBindings = getBindingsToResolve(config, allDisplays)
  if (orderedBindings.length === 0) {
    diagnostics.push('[display-restore] No persisted display bindings to resolve')
  }

  const bindingCandidates = orderedBindings
    .map((binding, index) => ({
      index,
      binding,
      bestScore: bestCandidateScore(binding, allDisplays),
    }))
    .sort((a, b) => b.bestScore - a.bestScore)

  const unresolved: Array<{ index: number; binding: PersistedDisplayBinding }> = []

  for (const item of bindingCandidates) {
    const candidates = allDisplays
      .filter((display) => !usedIds.has(display.id))
      .map((display) => ({
        display,
        score: scoreDisplay(display, item.binding),
      }))
      .sort((a, b) => b.score - a.score)

    const best = candidates[0]
    if (!best || !isAcceptableMatch(best, item.binding)) {
      unresolved.push({ index: item.index, binding: item.binding })
      diagnostics.push(
        `[display-restore] Unresolved binding ${bindingSummary(item.binding)}`
      )
      continue
    }

    assignments.set(item.index, best.display)
    usedIds.add(best.display.id)
    diagnostics.push(
      `[display-restore] Matched ${bindingSummary(item.binding)} -> ${displaySummary(best.display)} (score=${best.score})`
    )
  }

  const remaining = allDisplays.filter((display) => !usedIds.has(display.id))
  for (const item of unresolved) {
    if (remaining.length === 0) break
    const fallback = pickFallbackDisplay(remaining)
    const index = remaining.findIndex((d) => d.id === fallback.id)
    if (index >= 0) {
      remaining.splice(index, 1)
    }
    assignments.set(item.index, fallback)
    usedIds.add(fallback.id)
    usedFallback = true
    diagnostics.push(
      `[display-restore] Fallback for ${bindingSummary(item.binding)} -> ${displaySummary(fallback)}`
    )
  }

  const selectedDisplays = orderedBindings
    .map((_, index) => assignments.get(index))
    .filter((display): display is DisplayInfo => Boolean(display))

  if (selectedDisplays.length === 0 && allDisplays.length > 0) {
    const fallback = pickFallbackDisplay(allDisplays)
    selectedDisplays.push(fallback)
    usedFallback = true
    diagnostics.push(
      `[display-restore] Fallback to primary/default display ${displaySummary(fallback)}`
    )
  }

  return { selectedDisplays, diagnostics, usedFallback }
}

function getBindingsToResolve(
  config: DisplaySelectionConfig,
  allDisplays: DisplayInfo[]
): PersistedDisplayBinding[] {
  if (config.selectedDisplayIds.length === 0) {
    return []
  }

  if (config.selectedDisplayBindings.length > 0) {
    const byId = new Map(
      config.selectedDisplayBindings.map((binding) => [binding.id, binding])
    )
    const ordered = config.selectedDisplayIds
      .map((id) => byId.get(id))
      .filter((binding): binding is PersistedDisplayBinding => Boolean(binding))
    if (ordered.length > 0) {
      return ordered
    }
    return config.selectedDisplayBindings
  }

  return deriveDisplayBindings(config.selectedDisplayIds, allDisplays)
}

function bestCandidateScore(
  binding: PersistedDisplayBinding,
  displays: DisplayInfo[]
): number {
  let best = Number.NEGATIVE_INFINITY
  for (const display of displays) {
    best = Math.max(best, scoreDisplay(display, binding))
  }
  return best
}

function scoreDisplay(
  display: DisplayInfo,
  binding: PersistedDisplayBinding
): number {
  let score = 0

  if (display.id === binding.id) score += 1000
  if (
    display.x === binding.x
    && display.y === binding.y
    && display.width === binding.width
    && display.height === binding.height
  ) {
    score += 500
  }
  if (
    display.workAreaX === binding.workAreaX
    && display.workAreaY === binding.workAreaY
    && display.workAreaWidth === binding.workAreaWidth
    && display.workAreaHeight === binding.workAreaHeight
  ) {
    score += 320
  }
  if (display.width === binding.width && display.height === binding.height) score += 130
  if (Math.abs(display.scaleFactor - binding.scaleFactor) < EPSILON) score += 110
  if (display.rotation === binding.rotation) score += 80
  if (display.internal === binding.internal) score += 40
  if (display.isPrimary === binding.isPrimary) score += 30
  if (display.label === binding.label) score += 20

  return score
}

function isAcceptableMatch(
  candidate: ScoredCandidate,
  binding: PersistedDisplayBinding
): boolean {
  if (candidate.display.id === binding.id) return true

  const exactBounds =
    candidate.display.x === binding.x
    && candidate.display.y === binding.y
    && candidate.display.width === binding.width
    && candidate.display.height === binding.height
  if (exactBounds) return true

  const exactWorkArea =
    candidate.display.workAreaX === binding.workAreaX
    && candidate.display.workAreaY === binding.workAreaY
    && candidate.display.workAreaWidth === binding.workAreaWidth
    && candidate.display.workAreaHeight === binding.workAreaHeight
  if (exactWorkArea && candidate.display.width === binding.width && candidate.display.height === binding.height) {
    return true
  }

  return candidate.score >= 260
}

function pickFallbackDisplay(displays: DisplayInfo[]): DisplayInfo {
  return displays.find((display) => display.isPrimary) ?? displays[0]
}

function bindingSummary(binding: PersistedDisplayBinding): string {
  return `${binding.id}(${binding.width}x${binding.height}@${binding.x},${binding.y})`
}

function displaySummary(display: DisplayInfo): string {
  return `${display.id}(${display.width}x${display.height}@${display.x},${display.y})`
}
