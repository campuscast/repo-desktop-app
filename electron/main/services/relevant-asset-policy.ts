import type {
  ContentAsset,
  Publication,
  ReleaseManifest,
  ScheduleSlot,
} from '../../shared/ipc-types'

export const PREFETCH_LOOKAHEAD_MS = 5 * 60_000
export const NORMAL_SYNC_INTERVAL_MS = 5 * 60_000
export const NEAR_SLOT_SYNC_INTERVAL_MS = 30_000
export const RECOVERY_SYNC_INTERVAL_MS = 60_000

export interface RelevantAssetSelection {
  slots: ScheduleSlot[]
  assets: ContentAsset[]
  nextSlot: ScheduleSlot | null
  nextSlotStartsAt: string | null
}

function parseTime(value: string): number | null {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function slotEndsAfter(slot: ScheduleSlot, nowMs: number): boolean {
  const endMs = parseTime(slot.end_time)
  return endMs !== null && endMs > nowMs
}

function slotStartsAtOrBefore(slot: ScheduleSlot, targetMs: number): boolean {
  const startMs = parseTime(slot.start_time)
  return startMs !== null && startMs <= targetMs
}

function slotStartsAfter(slot: ScheduleSlot, nowMs: number): boolean {
  const startMs = parseTime(slot.start_time)
  return startMs !== null && startMs > nowMs
}

function getPublicationAssets(publication: Publication | undefined): string[] {
  if (!publication) return []

  const assetIds: string[] = []
  for (const item of publication.items) {
    if (item.video?.asset_id) {
      assetIds.push(item.video.asset_id)
    }
    if (item.slide?.image_asset_id) {
      assetIds.push(item.slide.image_asset_id)
    }
    if (item.slide?.logo_asset_id) {
      assetIds.push(item.slide.logo_asset_id)
    }
  }
  return assetIds
}

export function selectRelevantAssets(
  manifest: ReleaseManifest | null,
  now = new Date(),
  lookAheadMs = PREFETCH_LOOKAHEAD_MS
): RelevantAssetSelection {
  if (!manifest || manifest.slots.length === 0) {
    return {
      slots: [],
      assets: [],
      nextSlot: null,
      nextSlotStartsAt: null,
    }
  }

  const nowMs = now.getTime()
  const windowEndMs = nowMs + lookAheadMs
  const byStartAsc = [...manifest.slots].sort((a, b) => {
    const aStart = parseTime(a.start_time) ?? Number.MAX_SAFE_INTEGER
    const bStart = parseTime(b.start_time) ?? Number.MAX_SAFE_INTEGER
    return aStart - bStart
  })

  const nextSlot =
    byStartAsc.find((slot) => slotStartsAfter(slot, nowMs) && slotEndsAfter(slot, nowMs))
    ?? null

  const selectedSlotIds = new Set<string>()
  const selectedSlots: ScheduleSlot[] = []

  for (const slot of byStartAsc) {
    if (!slotEndsAfter(slot, nowMs)) continue
    const isActive = slotStartsAtOrBefore(slot, nowMs)
    const isWithinLookAhead =
      slotStartsAfter(slot, nowMs) && slotStartsAtOrBefore(slot, windowEndMs)

    if (!isActive && !isWithinLookAhead) continue
    if (selectedSlotIds.has(slot.slot_id)) continue
    selectedSlotIds.add(slot.slot_id)
    selectedSlots.push(slot)
  }

  if (selectedSlots.length === 0 && nextSlot) {
    const nextStartMs = parseTime(nextSlot.start_time)
    if (nextStartMs !== null) {
      for (const slot of byStartAsc) {
        if (parseTime(slot.start_time) !== nextStartMs) continue
        if (selectedSlotIds.has(slot.slot_id)) continue
        selectedSlotIds.add(slot.slot_id)
        selectedSlots.push(slot)
      }
    }
  }

  const publications = new Map(
    (manifest.publications ?? []).map((publication) => [
      publication.publication_id,
      publication,
    ])
  )
  const assetIds = new Set<string>()

  for (const slot of selectedSlots) {
    if (slot.asset_id) {
      assetIds.add(slot.asset_id)
    }
    if (slot.publication_id) {
      for (const publicationAssetId of getPublicationAssets(
        publications.get(slot.publication_id)
      )) {
        assetIds.add(publicationAssetId)
      }
    }
  }

  return {
    slots: selectedSlots,
    assets: manifest.assets.filter((asset) => assetIds.has(asset.asset_id)),
    nextSlot,
    nextSlotStartsAt: nextSlot?.start_time ?? null,
  }
}

export function computeSyncDelayMs(
  manifest: ReleaseManifest | null,
  now = new Date(),
  lookAheadMs = PREFETCH_LOOKAHEAD_MS
): number {
  const selection = selectRelevantAssets(manifest, now, lookAheadMs)
  if (!selection.nextSlotStartsAt) {
    return NORMAL_SYNC_INTERVAL_MS
  }

  const nextStartMs = parseTime(selection.nextSlotStartsAt)
  if (nextStartMs === null) {
    return NORMAL_SYNC_INTERVAL_MS
  }

  return nextStartMs - now.getTime() <= lookAheadMs
    ? NEAR_SLOT_SYNC_INTERVAL_MS
    : NORMAL_SYNC_INTERVAL_MS
}
