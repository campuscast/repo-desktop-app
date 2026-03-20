export type ProvisioningInvalidationContext =
  | 'device-revalidate'
  | 'device-info'
  | 'release'
  | 'manifest'
  | 'telemetry'
  | 'heartbeat'

const INVALIDATION_STATUSES: Record<ProvisioningInvalidationContext, number[]> = {
  // Revalidation and explicit device-info checks should treat 404 as fatal.
  'device-revalidate': [401, 403, 404, 410],
  'device-info': [401, 403, 404, 410],
  // Release/manifest 404 may mean "no release yet", so do not deprovision on 404.
  release: [401, 403, 410],
  manifest: [401, 403, 410],
  telemetry: [401, 403, 410],
  heartbeat: [401, 403, 410],
}

export function invalidationStatusesFor(
  context: ProvisioningInvalidationContext
): number[] {
  return INVALIDATION_STATUSES[context]
}

export function isProvisioningInvalidationStatus(
  statusCode: number | null,
  context: ProvisioningInvalidationContext
): boolean {
  return (
    typeof statusCode === 'number'
    && invalidationStatusesFor(context).includes(statusCode)
  )
}
