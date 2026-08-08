export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_NAMES_BY_JS_INDEX = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const PERIODS = [
  { period: 1, start: '9:20', end: '9:55' },
  { period: 2, start: '9:55', end: '10:30' },
  { period: 3, start: '10:45', end: '11:20' },
  { period: 4, start: '11:20', end: '11:55' },
  { period: 5, start: '11:55', end: '12:30' },
  { period: 6, start: '12:30', end: '1:05' },
  { period: 7, start: '1:25', end: '2:00' },
  { period: 8, start: '2:00', end: '2:35' },
  { period: 9, start: '2:35', end: '3:10' },
  { period: 10, start: '3:10', end: '4:00' },
]

// Formats a Date as YYYY-MM-DD using its *local* calendar fields.
// Deliberately not toISOString().slice(0,10) — that converts to UTC first,
// which rolls a local midnight back to the previous day in timezones ahead
// of UTC (e.g. IST).
export function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return toISO(new Date())
}

export function dayNameForDate(iso: string) {
  return DAY_NAMES_BY_JS_INDEX[new Date(iso + 'T00:00:00').getDay()]
}

// Half-day leave split — periods 1–6 (through the last pre-lunch slot,
// 12:30–1:05) count as the "first half"; 7–10 (after the 1:05–1:25 lunch
// gap) count as the "second half". Adjust here if the school's lunch
// break ever moves to a different period.
export const FIRST_HALF_LAST_PERIOD = 6

export type LeaveHalf = 'full' | 'first' | 'second'

export function periodsForHalf(half: LeaveHalf): number[] {
  const all = PERIODS.map((p) => p.period)
  if (half === 'first') return all.filter((p) => p <= FIRST_HALF_LAST_PERIOD)
  if (half === 'second') return all.filter((p) => p > FIRST_HALF_LAST_PERIOD)
  return all
}

export function halfLabel(half: LeaveHalf): string {
  if (half === 'first') return 'Half day (AM)'
  if (half === 'second') return 'Half day (PM)'
  return 'Full day'
}
