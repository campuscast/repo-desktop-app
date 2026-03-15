import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
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
