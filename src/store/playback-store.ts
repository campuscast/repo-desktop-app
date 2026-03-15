import { create } from 'zustand'
import type {
  PlaybackState,
  ScheduleSlot,
  ContentAsset,
  ReleaseManifest,
} from '../../electron/shared/ipc-types'
import { isWithinSchedule } from '@/lib/utils'

interface PlaybackStore {
  // Current manifest
  manifest: ReleaseManifest | null
  setManifest: (manifest: ReleaseManifest | null) => void

  // Playback state
  state: PlaybackState
  setState: (state: Partial<PlaybackState>) => void

  // Computed: find the active slot based on current time
  evaluateSchedule: () => void

  // Asset URL mapping (assetId → local file path)
  assetPaths: Map<string, string>
  setAssetPath: (assetId: string, path: string) => void
  getAssetPath: (assetId: string) => string | null
}

const INITIAL_STATE: PlaybackState = {
  status: 'idle',
  currentSlot: null,
  currentAsset: null,
  nextSlot: null,
  releaseId: null,
  errors: [],
  updatedAt: new Date().toISOString(),
}

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  manifest: null,
  setManifest: (manifest) => {
    set({ manifest })
    if (manifest) {
      set((state) => ({
        state: {
          ...state.state,
          releaseId: manifest.release_id,
          status: 'loading',
        },
      }))
    }
  },

  state: { ...INITIAL_STATE },
  setState: (partial) =>
    set((store) => ({
      state: {
        ...store.state,
        ...partial,
        updatedAt: new Date().toISOString(),
      },
    })),

  evaluateSchedule: () => {
    const { manifest, assetPaths } = get()
    if (!manifest || manifest.slots.length === 0) {
      set({
        state: {
          ...INITIAL_STATE,
          releaseId: manifest?.release_id ?? null,
          status: 'idle',
          updatedAt: new Date().toISOString(),
        },
      })
      return
    }

    const now = new Date()
    const slots = [...manifest.slots].sort((a, b) => b.priority - a.priority)

    // Find active slot (highest priority that is within schedule)
    const activeSlot = slots.find((s) =>
      isWithinSchedule(s.start_time, s.end_time, now)
    )

    // Find next upcoming slot
    const futureSlots = slots
      .filter((s) => new Date(s.start_time) > now)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    const nextSlot = futureSlots[0] ?? null

    if (!activeSlot) {
      set({
        state: {
          status: 'idle',
          currentSlot: null,
          currentAsset: null,
          nextSlot,
          releaseId: manifest.release_id,
          errors: [],
          updatedAt: new Date().toISOString(),
        },
      })
      return
    }

    // Find the asset for the active slot
    const asset =
      manifest.assets.find((a) => a.asset_id === activeSlot.asset_id) ?? null

    // Check if content is available locally
    const localPath = asset ? assetPaths.get(asset.asset_id) : null
    const assetWithPath = asset
      ? { ...asset, download_url: localPath ?? asset.download_url }
      : null

    set({
      state: {
        status: localPath || !asset ? 'playing' : 'loading',
        currentSlot: activeSlot,
        currentAsset: assetWithPath,
        nextSlot,
        releaseId: manifest.release_id,
        errors: [],
        updatedAt: new Date().toISOString(),
      },
    })
  },

  assetPaths: new Map(),
  setAssetPath: (assetId, path) => {
    set((store) => {
      const newMap = new Map(store.assetPaths)
      newMap.set(assetId, path)
      return { assetPaths: newMap }
    })
  },
  getAssetPath: (assetId) => {
    return get().assetPaths.get(assetId) ?? null
  },
}))
