export interface PlaybackOpenDecision {
  allowed: boolean
  reason: 'ok' | 'already-running'
}

export interface PlaybackCloseDecision {
  allowed: boolean
  reason: 'ok' | 'already-stopped'
}

export function decidePlaybackOpen(
  windowCount: number,
  playbackRequested = false
): PlaybackOpenDecision {
  if (windowCount > 0 || playbackRequested) {
    return { allowed: false, reason: 'already-running' }
  }
  return { allowed: true, reason: 'ok' }
}

export function decidePlaybackClose(
  windowCount: number,
  playbackRequested = false
): PlaybackCloseDecision {
  if (windowCount === 0 && !playbackRequested) {
    return { allowed: false, reason: 'already-stopped' }
  }
  return { allowed: true, reason: 'ok' }
}
