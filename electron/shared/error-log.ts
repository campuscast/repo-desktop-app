const TIMESTAMP_PREFIX_RE =
  /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z\]\s/

export function formatErrorTimestamp(date = new Date()): string {
  const iso = date.toISOString()
  return `${iso.slice(0, 19).replace('T', ' ')}Z`
}

export function withErrorTimestamp(
  message: string,
  date = new Date()
): string {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    return `[${formatErrorTimestamp(date)}] Unknown error`
  }
  if (TIMESTAMP_PREFIX_RE.test(trimmed)) {
    return trimmed
  }
  return `[${formatErrorTimestamp(date)}] ${trimmed}`
}
