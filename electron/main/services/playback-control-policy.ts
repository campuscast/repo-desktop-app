export interface PlaybackOpenDecision {
  allowed: boolean
  reason: 'ok' | 'already-running'
}

export interface PlaybackCloseDecision {
  allowed: boolean
  reason: 'ok' | 'already-stopped'
}

export function decidePlaybackOpen(windowCount: number): PlaybackOpenDecision {
  if (windowCount > 0) {
    return { allowed: false, reason: 'already-running' }
  }
  return { allowed: true, reason: 'ok' }
}

export function decidePlaybackClose(
  windowCount: number
): PlaybackCloseDecision {
  if (windowCount === 0) {
    return { allowed: false, reason: 'already-stopped' }
  }
  return { allowed: true, reason: 'ok' }
}
