const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const DAY_WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

export function formatWorkoutDate(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return sameYear ? DAY.format(date) : DAY_WITH_YEAR.format(date)
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso))
}

export function formatShortDate(iso: string): string {
  return DAY_WITH_YEAR.format(new Date(iso))
}

const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' })

/**
 * A `Date` rather than an ISO string, deliberately: the training calendar's
 * cells are local midnights, and `toISOString()` on a local midnight lands on
 * the day before in every timezone east of UTC. The heatmap would label the
 * wrong day for half the planet.
 */
export function formatDayLabel(date: Date): string {
  return DAY.format(date)
}

export function formatMonthLabel(date: Date): string {
  return MONTH.format(date)
}

/** "3 days ago" / "today" — the only context needed above a set input. */
export function formatRelativeDay(iso: string): string {
  const then = new Date(iso)
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'in progress'
  const minutes = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000),
  )
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
