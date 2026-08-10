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

// ---- Week helpers -------------------------------------------------------
// Used by the Timetable tab's week picker: the grid always shows a full
// Mon–Fri week, so navigation works in whole-week steps rather than single
// days — picking "a day" to see a 5-day grid was the confusing part.

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// Monday of the week containing this date, as an ISO string.
export function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const jsDay = d.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay
  d.setDate(d.getDate() + diffToMonday)
  return toISO(d)
}

// The five weekday dates (Mon–Fri) for the week starting at mondayIso,
// in the same order as DAYS.
export function weekDates(mondayIso: string): string[] {
  return DAYS.map((_, i) => addDays(mondayIso, i))
}

export function formatWeekLabel(mondayIso: string): string {
  const fridayIso = addDays(mondayIso, 4)
  const mon = new Date(mondayIso + 'T00:00:00')
  const fri = new Date(fridayIso + 'T00:00:00')
  const sameMonth = mon.getMonth() === fri.getMonth() && mon.getFullYear() === fri.getFullYear()
  const monStr = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const friStr = fri.toLocaleDateString(
    'en-US',
    sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  )
  return `${monStr} – ${friStr}`
}

// Half-day leave split — periods 1–6 (through the last pre-lunch slot,
// 12:30–1:05) count as the "first half"; 7–10 (after the 1:05–1:25 lunch
// gap) count as the "second half". Adjust here if the school's lunch
// break ever moves to a different period.
export const FIRST_HALF_LAST_PERIOD = 6

export type LeaveHalf = 'full' | 'first' | 'second' | 'q1' | 'q2' | 'q3' | 'q4'

// Quarters split each half evenly in two: Q1/Q2 make up the first half,
// Q3/Q4 make up the second half — so a quarter is always a strict subset
// of the matching half, and the two systems never disagree.
function splitEven(periods: number[], parts: number): number[][] {
  const size = Math.ceil(periods.length / parts)
  const chunks: number[][] = []
  for (let i = 0; i < parts; i++) chunks.push(periods.slice(i * size, (i + 1) * size))
  return chunks
}

const ALL_PERIOD_NUMBERS = PERIODS.map((p) => p.period)
const FIRST_HALF_PERIODS = ALL_PERIOD_NUMBERS.filter((p) => p <= FIRST_HALF_LAST_PERIOD)
const SECOND_HALF_PERIODS = ALL_PERIOD_NUMBERS.filter((p) => p > FIRST_HALF_LAST_PERIOD)
const [Q1_PERIODS, Q2_PERIODS] = splitEven(FIRST_HALF_PERIODS, 2)
const [Q3_PERIODS, Q4_PERIODS] = splitEven(SECOND_HALF_PERIODS, 2)

export function periodsForHalf(half: LeaveHalf): number[] {
  if (half === 'first') return FIRST_HALF_PERIODS
  if (half === 'second') return SECOND_HALF_PERIODS
  if (half === 'q1') return Q1_PERIODS
  if (half === 'q2') return Q2_PERIODS
  if (half === 'q3') return Q3_PERIODS
  if (half === 'q4') return Q4_PERIODS
  return ALL_PERIOD_NUMBERS
}

function rangeLabel(periods: number[]): string {
  if (periods.length === 0) return ''
  if (periods.length === 1) return `P${periods[0]}`
  return `P${periods[0]}–P${periods[periods.length - 1]}`
}

export function halfLabel(half: LeaveHalf): string {
  if (half === 'first') return 'Half day (AM)'
  if (half === 'second') return 'Half day (PM)'
  if (half === 'q1') return `Quarter 1 (${rangeLabel(Q1_PERIODS)})`
  if (half === 'q2') return `Quarter 2 (${rangeLabel(Q2_PERIODS)})`
  if (half === 'q3') return `Quarter 3 (${rangeLabel(Q3_PERIODS)})`
  if (half === 'q4') return `Quarter 4 (${rangeLabel(Q4_PERIODS)})`
  return 'Full day'
}
