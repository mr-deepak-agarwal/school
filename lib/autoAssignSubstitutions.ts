import { supabase } from './supabaseClient'
import type { Teacher, TimetableSlot } from './types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface AutoAssignResult {
  assigned: { slot: TimetableSlot; teacher: Teacher; viaPreference: boolean }[]
  unassigned: TimetableSlot[]
}

/**
 * Runs when a teacher's leave is approved for a given date.
 * For every period that teacher was due to take that day:
 *   1. Prefer a teacher who (a) teaches the same subject and (b) has opted in as a
 *      preferred substitute for that date (`preferred_substitutions`).
 *   2. Otherwise, any teacher who teaches the same subject and is free that period
 *      (not on leave, not already teaching another class, not already covering
 *      another substitution at that period).
 *   3. Otherwise the slot is left unassigned for the admin to allocate manually
 *      on the Substitutions page.
 *
 * Writes matches straight into `substitutions`. Slots that already have a
 * substitution recorded (e.g. an admin assigned one ahead of time) are left alone.
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
      supabase.from('preferred_substitutions').select('teacher_id').eq('date', date).eq('preferred', true),
    ])

  const onLeaveIds = new Set((leaves ?? []).map((l: any) => l.teacher_id as string))
  onLeaveIds.add(teacherId)

  const preferredIds = new Set((preferred ?? []).map((p: any) => p.teacher_id as string))
  const timetableById = Object.fromEntries((dayTimetable ?? []).map((t: any) => [t.id, t as TimetableSlot]))
  const alreadyCoveredTimetableIds = new Set((existingSubs ?? []).map((s: any) => s.timetable_id as number))

  // period -> set of teacher ids already busy (regular class or an already-assigned sub duty)
  const busyAtPeriod = new Map<number, Set<string>>()
  for (const t of (dayTimetable ?? []) as TimetableSlot[]) {
    if (!t.teacher_id) continue
    if (!busyAtPeriod.has(t.period)) busyAtPeriod.set(t.period, new Set())
    busyAtPeriod.get(t.period)!.add(t.teacher_id)
  }
  for (const s of (existingSubs ?? []) as any[]) {
    const row = timetableById[s.timetable_id]
    if (!row) continue
    if (!busyAtPeriod.has(row.period)) busyAtPeriod.set(row.period, new Set())
    busyAtPeriod.get(row.period)!.add(s.substitute_teacher_id)
  }

  const teacherList = ((teachers ?? []) as Teacher[]).slice().sort((a, b) => a.name.localeCompare(b.name))

  const assigned: AutoAssignResult['assigned'] = []
  const unassigned: TimetableSlot[] = []
  const toInsert: any[] = []

  for (const slot of slots as TimetableSlot[]) {
    if (alreadyCoveredTimetableIds.has(slot.id)) continue

    if (!busyAtPeriod.has(slot.period)) busyAtPeriod.set(slot.period, new Set())
    const busy = busyAtPeriod.get(slot.period)!

    const candidates = teacherList.filter(
      (t) => t.id !== slot.teacher_id && !onLeaveIds.has(t.id) && !busy.has(t.id) && t.subjects?.includes(slot.subject)
    )

    if (candidates.length === 0) {
      unassigned.push(slot)
      continue
    }

    const preferredMatch = candidates.find((t) => preferredIds.has(t.id))
    const chosen = preferredMatch ?? candidates[0]

    busy.add(chosen.id)
    assigned.push({ slot, teacher: chosen, viaPreference: !!preferredMatch })
    toInsert.push({
      date,
      timetable_id: slot.id,
      original_teacher_id: slot.teacher_id,
      substitute_teacher_id: chosen.id,
    })
  }

  if (toInsert.length > 0) {
    await supabase.from('substitutions').upsert(toInsert, { onConflict: 'date,timetable_id' })
  }

  return { assigned, unassigned }
}
