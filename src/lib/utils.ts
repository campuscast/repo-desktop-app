import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function resolveTimeZone(timeZone: string | null | undefined): string | undefined {
  if (!timeZone || timeZone === 'system') return undefined
  return timeZone
}

function formatDateTime(date: Date, timeZone: string | null | undefined): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: resolveTimeZone(timeZone),
  })
  const parts = formatter.formatToParts(date)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')} ${byType.get('hour')}:${byType.get('minute')}:${byType.get('second')}`
}

export function formatTime(
  iso: string | null,
  timeZone: string | null | undefined = 'system'
): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return formatDateTime(date, timeZone)
}

function parseErrorTimestamp(stamp: string, hasUtcSuffix: boolean): Date | null {
  const [datePart, timePart] = stamp.split(' ')
  if (!datePart || !timePart) return null

  if (hasUtcSuffix) {
    const parsed = new Date(`${datePart}T${timePart}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second] = timePart.split(':').map(Number)
  if (
    !Number.isFinite(year)
    || !Number.isFinite(month)
    || !Number.isFinite(day)
    || !Number.isFinite(hour)
    || !Number.isFinite(minute)
    || !Number.isFinite(second)
  ) {
    return null
  }
  const parsed = new Date(year, month - 1, day, hour, minute, second)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const ERROR_PREFIX_RE =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(Z?)\]\s*(.*)$/

export function formatErrorForDisplay(
  error: string | null | undefined,
  timeZone: string | null | undefined = 'system'
): string {
  if (!error) return '—'
  const match = error.match(ERROR_PREFIX_RE)
  if (!match) return error

  const [, stamp, zSuffix, message] = match
  const parsed = parseErrorTimestamp(stamp, zSuffix === 'Z')
  if (!parsed) {
    return `[${stamp}] ${message}`
  }

  return `[${formatDateTime(parsed, timeZone)}] ${message}`
}

export function isWithinSchedule(
  startTime: string,
  endTime: string,
  now = new Date()
): boolean {
  const start = new Date(startTime)
  const end = new Date(endTime)
  return now >= start && now < end
}
