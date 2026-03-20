import type { ConnectionStatus } from './ipc-types'

export type EffectiveConnectionState = 'connected' | 'connecting' | 'disconnected'

export function deriveEffectiveConnection(
  status: ConnectionStatus
): EffectiveConnectionState {
  if (status.backend === 'connected' || status.mqtt === 'connected') {
    return 'connected'
  }
  if (status.backend === 'connecting' || status.mqtt === 'connecting') {
    return 'connecting'
  }
  return 'disconnected'
}

export function isEffectivelyDisconnected(status: ConnectionStatus): boolean {
  return deriveEffectiveConnection(status) === 'disconnected'
}
