import type { ConnectionStatus } from '../../shared/ipc-types'

export type ReleaseFetchScenario =
  | 'release-available'
  | 'no-active-release'
  | 'network-error'

export interface ReleaseFetchPolicyInput {
  scenario: ReleaseFetchScenario
  errorMessage?: string
}

export interface ReleaseFetchPolicyDecision {
  backendStatus: ConnectionStatus['backend']
  lastError: string | null
  shouldUseFallbackManifest: boolean
}

export function decideReleaseFetchPolicy(
  input: ReleaseFetchPolicyInput
): ReleaseFetchPolicyDecision {
  switch (input.scenario) {
    case 'release-available':
      return {
        backendStatus: 'connected',
        lastError: null,
        shouldUseFallbackManifest: false,
      }
    case 'no-active-release':
      // Backend is reachable; there is simply nothing to play right now.
      return {
        backendStatus: 'connected',
        lastError: null,
        shouldUseFallbackManifest: false,
      }
    case 'network-error':
      return {
        backendStatus: 'disconnected',
        lastError: input.errorMessage ?? 'Backend unreachable',
        shouldUseFallbackManifest: true,
      }
    default:
      return {
        backendStatus: 'disconnected',
        lastError: 'Backend unreachable',
        shouldUseFallbackManifest: true,
      }
  }
}
