import type { TimetableSlot } from './types'

// ---- Tunable constants -----------------------------------------------
// A substitute shouldn't be pushed past a normal day's load, and shouldn't
// be run several periods back-to-back with no break. These are workload
// *protections*, not hard blocks — a teacher who'd go over is still shown
// in the list (in an "over limit" group) so the admin can override in a
// genuine emergency, it's just never the auto-suggested pick.
export const MAX_PERIODS_PER_DAY = 5
export const MAX_CONTINUOUS_PERIODS = 3

// How many times a teacher needs to have already covered a specific
// section as a substitute before they're automatically opted in as a
// preferred substitute for it (shows up in the Preferred Periods tab and
// gets bumped to the top of future suggestions for that section).
export const AUTO_PREFERRED_THRESHOLD = 3

// How many days of leave (within the rolling window below) before a
// teacher is flagged as a frequent absentee in the UI, and their periods
// are auto-assigned as soon as they're marked absent instead of waiting
// for the admin to fill each slot by hand.
export const FREQUENT_ABSENCE_THRESHOLD = 4
export const FREQUENT_ABSENCE_WINDOW_DAYS = 30

export interface WorkloadCheck {
  totalAfter: number
  exceedsDaily: boolean
  continuousRunAfter: number
  exceedsContinuous: boolean
}

/**
 * All period numbers a teacher is already occupied for on a given day —
 * their normal timetable rows plus any substitution periods they've
 * already picked up for that date.
 */
export function occupiedPeriods(
  teacherId: string,
  dayTimetable: Pick<TimetableSlot, 'teacher_id' | 'period'>[],
  extraSubPeriods: number[] = []
): number[] {
  const fromTimetable = dayTimetable
    .filter((r) => r.teacher_id === teacherId)
    .map((r) => Number(r.period))
  return Array.from(new Set([...fromTimetable, ...extraSubPeriods])).sort((a, b) => a - b)
}

function longestRun(periods: number[]): number {
  if (periods.length === 0) return 0
  const sorted = [...periods].sort((a, b) => a - b)
  let longest = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    current = sorted[i] === sorted[i - 1] + 1 ? current + 1 : 1
    longest = Math.max(longest, current)
  }
  return longest
}

/**
 * Would adding `newPeriod` push this teacher past the daily load cap, or
 * create a run of more than MAX_CONTINUOUS_PERIODS back-to-back periods?
 */
export function checkWorkload(currentPeriods: number[], newPeriod: number): WorkloadCheck {
  const after = Array.from(new Set([...currentPeriods, newPeriod]))
  const continuousRunAfter = longestRun(after)
  return {
    totalAfter: after.length,
    exceedsDaily: after.length > MAX_PERIODS_PER_DAY,
    continuousRunAfter,
    exceedsContinuous: continuousRunAfter > MAX_CONTINUOUS_PERIODS,
  }
}

export function isWithinWorkloadLimits(currentPeriods: number[], newPeriod: number): boolean {
  const check = checkWorkload(currentPeriods, newPeriod)
  return !check.exceedsDaily && !check.exceedsContinuous
}
