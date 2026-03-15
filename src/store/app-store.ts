import { create } from 'zustand'
import type {
  AppConfig,
  DisplayInfo,
  ConnectionStatus,
  ActivationState,
} from '../../electron/shared/ipc-types'

export type AppScreen =
  | 'boot'
  | 'setup'
  | 'activation'
  | 'diagnostics'
  | 'displays'
  | 'settings'

interface AppStore {
  // Current screen (state-driven, not route-driven)
  screen: AppScreen
  setScreen: (screen: AppScreen) => void

  // Config loaded from persistence
  config: AppConfig | null
  setConfig: (config: AppConfig) => void
  updateConfig: (partial: Partial<AppConfig>) => void

  // Displays
  displays: DisplayInfo[]
  setDisplays: (displays: DisplayInfo[]) => void
  selectedDisplayIds: string[]
  setSelectedDisplayIds: (ids: string[]) => void

  // Connection
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void

  // Activation
  activationCode: string | null
  setActivationCode: (code: string | null) => void
  activationState: ActivationState
  setActivationState: (state: ActivationState) => void

  // Errors
  errors: string[]
  addError: (error: string) => void
  clearErrors: () => void

  // Computed
  isActivated: () => boolean
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: 'boot',
  setScreen: (screen) => set({ screen }),

  config: null,
  setConfig: (config) =>
    set({
      config,
      activationState: config.activationState,
      selectedDisplayIds: config.selectedDisplayIds,
    }),
  updateConfig: (partial) =>
    set((state) => ({
      config: state.config ? { ...state.config, ...partial } : null,
    })),

  displays: [],
  setDisplays: (displays) => set({ displays }),
  selectedDisplayIds: [],
  setSelectedDisplayIds: (ids) => set({ selectedDisplayIds: ids }),

  connectionStatus: {
    backend: 'disconnected',
    mqtt: 'disconnected',
    lastError: null,
  },
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  activationCode: null,
  setActivationCode: (code) => set({ activationCode: code }),
  activationState: 'unregistered',
  setActivationState: (state) => set({ activationState: state }),

  errors: [],
  addError: (error) =>
    set((state) => ({
      errors: [...state.errors.slice(-49), error], // keep last 50
    })),
  clearErrors: () => set({ errors: [] }),

  isActivated: () => get().activationState === 'activated',
}))
