import type { PublicationItem, SlotMetadata } from './ipc-types'

export interface VideoAudioConfig {
  muted: boolean
  defaultMuted: boolean
  volume: number
}

/**
 * Desktop player should always play video with sound.
 * CMS schedule/publication models default mute=true for signage scenarios,
 * which would otherwise mute desktop playback by default.
 */
export function resolveDesktopVideoAudioConfig(
  _publicationItem?: PublicationItem | null,
  _metadata?: SlotMetadata
): VideoAudioConfig {
  return {
    muted: false,
    defaultMuted: false,
    volume: 1,
  }
}
