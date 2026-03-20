const processStartedAtMs = Date.now()

function serializeDetails(details?: string | object): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  try {
    return JSON.stringify(details)
  } catch {
    return '[unserializable-details]'
  }
}

export function startupMark(
  stage: string,
  details?: string | object
): void {
  const elapsed = Date.now() - processStartedAtMs
  const suffix = serializeDetails(details)
  console.info(
    suffix
      ? `[startup][+${elapsed}ms] ${stage} ${suffix}`
      : `[startup][+${elapsed}ms] ${stage}`
  )
}

export function startupElapsedMs(): number {
  return Date.now() - processStartedAtMs
}
