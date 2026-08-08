import { supabase } from './supabaseClient'
import type { Teacher, TimetableSlot } from './types'
import { teacherTeachesSubject } from './subjectMatch'
import { occupiedPeriods, checkWorkload } from './workload'
import { maybeAutoMarkPreferred } from './autoPreferred'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface AutoAssignResult {
  assigned: { slot: TimetableSlot; teacher: Teacher; viaPreference: boolean }[]
  unassigned: TimetableSlot[]
}

/**
 * Runs when a teacher's leave is approved for a given date.
 * For every period that teacher was due to take that day:
 *   1. Prefer a teacher who (a) teaches the same subject and (b) has an active
 *      (not yet fulfilled) preference to substitute for that exact section
 *      (`preferred_substitutions`, no longer date-scoped).
 *   2. Otherwise, any teacher who teaches the same subject and is free that period
 *      (not on leave, not already teaching another class, not already covering
 *      another substitution at that period).
 *   3. Otherwise the slot is left unassigned for the admin to allocate manually
 *      on the Substitutions page.
 *
 * Writes matches straight into `substitutions`, and flags any preference row
 * that got used as `fulfilled` so it stops being suggested for that section
 * again but stays around as a record. Slots that already have a substitution
 * recorded (e.g. an admin assigned one ahead of time) are left alone.
 */
export async function autoAssignSubstitutionsForLeave(
  teacherId: string,
  date: string
): Promise<AutoAssignResult> {
  const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()]

  const { data: slots } = await supabase
    .from('timetable')
    .select('*')
    .eq('day', dayName)
    .eq('teacher_id', teacherId)
    .order('period')

  if (!slots || slots.length === 0) {
    return { assigned: [], unassigned: [] }
  }

  const [{ data: teachers }, { data: leaves }, { data: existingSubs }, { data: dayTimetable }, { data: preferred }] =
    await Promise.all([
      supabase.from('teachers').select('*'),
      supabase.from('leave_register').select('teacher_id').eq('date', date).eq('status', 'approved'),
      supabase.from('substitutions').select('*').eq('date', date),
      supabase.from('timetable').select('*').eq('day', dayName),
      supabase
        .from('preferred_substitutions')
        .select('id, teacher_id, section_id')
        .eq('preferred', true)
        .eq('fulfilled', false),
    ])

  const onLeaveIds = new Set((leaves ?? []).map((l: any) => l.teacher_id as string))
  onLeaveIds.add(teacherId)

  // teacher_id -> preferred_substitutions row, keyed by section, so we can
  // both match "is this teacher preferred for this exact section" and, once
  // used, mark that specific row fulfilled.
  const preferredBySection = new Map<string, { id: number; teacher_id: string }>()
  for (const p of (preferred ?? []) as any[]) {
    preferredBySection.set(`${p.teacher_id}:${p.section_id}`, { id: p.id, teacher_id: p.teacher_id })
  }
  const timetableById = Object.fromEntries((dayTimetable ?? []).map((t: any) => [t.id, t as TimetableSlot]))
  const alreadyCoveredTimetableIds = new Set((existingSubs ?? []).map((s: any) => s.timetable_id as number))

  // period -> set of teacher ids already busy (regular class or an already-assigned sub duty)
  // Keys are coerced to Number: Map lookups use strict identity, so a period
  // stored as a numeric string in one row and a number in another would
  // otherwise create two separate map entries instead of merging.
  const busyAtPeriod = new Map<number, Set<string>>()
  for (const t of (dayTimetable ?? []) as TimetableSlot[]) {
    if (!t.teacher_id) continue
    const period = Number(t.period)
    if (!busyAtPeriod.has(period)) busyAtPeriod.set(period, new Set())
    busyAtPeriod.get(period)!.add(String(t.teacher_id))
  }
  for (const s of (existingSubs ?? []) as any[]) {
    const row = timetableById[s.timetable_id]
    if (!row) continue
    const period = Number(row.period)
    if (!busyAtPeriod.has(period)) busyAtPeriod.set(period, new Set())
    busyAtPeriod.get(period)!.add(String(s.substitute_teacher_id))
  }

  const teacherList = ((teachers ?? []) as Teacher[]).slice().sort((a, b) => a.name.localeCompare(b.name))

  // Tracks, per teacher, every period they hold today — their normal load
  // plus anything already picked up as a substitute (including ones this
  // very pass hands out) — so the 5-periods / 3-in-a-row workload caps are
  // respected instead of piling everything onto the first free name.
  const extraPeriodsByTeacher = new Map<string, number[]>()
  for (const s of (existingSubs ?? []) as any[]) {
    const row = timetableById[s.timetable_id]
    if (!row) continue
    const arr = extraPeriodsByTeacher.get(s.substitute_teacher_id) ?? []
    arr.push(Number(row.period))
    extraPeriodsByTeacher.set(s.substitute_teacher_id, arr)
  }

  const assigned: AutoAssignResult['assigned'] = []
  const unassigned: TimetableSlot[] = []
  const toInsert: any[] = []
  const fulfilledPrefIds = new Set<number>()

  for (const slot of slots as TimetableSlot[]) {
    if (alreadyCoveredTimetableIds.has(slot.id)) continue

    const slotPeriod = Number(slot.period)
    if (!busyAtPeriod.has(slotPeriod)) busyAtPeriod.set(slotPeriod, new Set())
    const busy = busyAtPeriod.get(slotPeriod)!

    const withinWorkload = (t: Teacher) => {
      const occ = occupiedPeriods(t.id, (dayTimetable ?? []) as TimetableSlot[], extraPeriodsByTeacher.get(t.id) ?? [])
      const check = checkWorkload(occ, slotPeriod)
      return !check.exceedsDaily && !check.exceedsContinuous
    }

    const candidates = teacherList.filter(
      (t) =>
        t.id !== slot.teacher_id &&
        !onLeaveIds.has(t.id) &&
        !busy.has(String(t.id)) &&
        teacherTeachesSubject(t, slot.subject) &&
        withinWorkload(t)
    )

    if (candidates.length === 0) {
      unassigned.push(slot)
      continue
    }

    const preferredMatch = candidates.find((t) => preferredBySection.has(`${t.id}:${slot.section_id}`))
    const chosen = preferredMatch ?? candidates[0]

    busy.add(String(chosen.id))
    const chosenExtra = extraPeriodsByTeacher.get(chosen.id) ?? []
    chosenExtra.push(slotPeriod)
    extraPeriodsByTeacher.set(chosen.id, chosenExtra)

    assigned.push({ slot, teacher: chosen, viaPreference: !!preferredMatch })
    toInsert.push({
      date,
      timetable_id: slot.id,
      original_teacher_id: slot.teacher_id,
      substitute_teacher_id: chosen.id,
    })

    if (preferredMatch) {
      const usedPref = preferredBySection.get(`${preferredMatch.id}:${slot.section_id}`)
      if (usedPref) fulfilledPrefIds.add(usedPref.id)
    }
  }

  if (toInsert.length > 0) {
    await supabase.from('substitutions').upsert(toInsert, { onConflict: 'date,timetable_id' })
  }

  if (fulfilledPrefIds.size > 0) {
    await supabase.from('preferred_substitutions').update({ fulfilled: true }).in('id', [...fulfilledPrefIds])
  }

  // Frequent-cover check: anyone who's now covered a section enough times
  // gets automatically opted in as a preferred substitute for it.
  for (const a of assigned) {
    await maybeAutoMarkPreferred(a.teacher.id, a.slot.section_id)
  }

  return { assigned, unassigned }
}
