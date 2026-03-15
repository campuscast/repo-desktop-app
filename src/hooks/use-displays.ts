import { useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'

export function useDisplays() {
  const displays = useAppStore((s) => s.displays)
  const selectedDisplayIds = useAppStore((s) => s.selectedDisplayIds)
  const setSelectedDisplayIds = useAppStore((s) => s.setSelectedDisplayIds)

  const toggleDisplay = useCallback(
    async (displayId: string) => {
      const current = selectedDisplayIds
      const next = current.includes(displayId)
        ? current.filter((id) => id !== displayId)
        : [...current, displayId]

      setSelectedDisplayIds(next)
      await window.electronAPI.setSelectedDisplays(next)
      await window.electronAPI.saveConfig({ selectedDisplayIds: next })
    },
    [selectedDisplayIds, setSelectedDisplayIds]
  )

  const startPlayback = useCallback(async () => {
    if (selectedDisplayIds.length === 0) {
      toast.error('Select at least one display for playback')
      return
    }
    await window.electronAPI.openPlaybackWindows()
    toast.success('Playback started')
  }, [selectedDisplayIds])

  const stopPlayback = useCallback(async () => {
    await window.electronAPI.closePlaybackWindows()
    toast.info('Playback stopped')
  }, [])

  const refreshDisplays = useCallback(async () => {
    const updated = await window.electronAPI.getDisplays()
    useAppStore.getState().setDisplays(updated)
  }, [])

  return {
    displays,
    selectedDisplayIds,
    toggleDisplay,
    startPlayback,
    stopPlayback,
    refreshDisplays,
  }
}
