'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PeriodSwap, PreferredSub, Section, Teacher, TimetableSlot } from '@/lib/types'
import { teacherTeachesSection, teacherTeachesSubject } from '@/lib/subjectMatch'
import { swapFor, swapPartner } from '@/lib/periodSwaps'
import { todayISO, dayNameForDate } from '@/lib/periods'
import TeacherAutocomplete from './TeacherAutocomplete'

export default function SubstitutionsTab() {
  const [date, setDate] = useState(todayISO())
  const [absentTeacherId, setAbsentTeacherId] = useState('')

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [fullTimetable, setFullTimetable] = useState<TimetableSlot[]>([])

  const [absentSlots, setAbsentSlots] = useState<TimetableSlot[]>([])
  const [dayTimetable, setDayTimetable] = useState<TimetableSlot[]>([])
  const [existingSubs, setExistingSubs] = useState<Record<number, string>>({})
  const [preferredRows, setPreferredRows] = useState<PreferredSub[]>([])
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const dayName = useMemo(() => dayNameForDate(date), [date])

  // Static lookups, loaded once.
  useEffect(() => {
    async function loadStatic() {
      const [{ data: t }, { data: s }, { data: tt }] = await Promise.all([
        supabase.from('teachers').select('*').order('name'),
        supabase.from('sections').select('id, class, section'),
        supabase.from('timetable').select('id, day, period, section_id, subject, teacher_id'),
      ])
      setTeachers((t ?? []) as Teacher[])
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
      setFullTimetable((tt ?? []) as TimetableSlot[])
    }
    loadStatic()
  }, [])

  async function loadForDate() {
    if (!absentTeacherId) {
      setAbsentSlots([])
      return
    }
    setLoading(true)

    const [{ data: mySlots }, { data: dayRows }, { data: subs }, { data: pref }, { data: swapRows }] =
      await Promise.all([
        supabase.from('timetable').select('*').eq('teacher_id', absentTeacherId).eq('day', dayName).order('period'),
        supabase.from('timetable').select('*').eq('day', dayName),
        supabase.from('substitutions').select('*').eq('date', date),
        supabase.from('preferred_substitutions').select('*').eq('date', date).eq('preferred', true),
        supabase.from('period_swaps').select('*').eq('swap_date', date),
      ])

    setAbsentSlots((mySlots ?? []) as TimetableSlot[])
    setDayTimetable((dayRows ?? []) as TimetableSlot[])
    setExistingSubs(Object.fromEntries((subs ?? []).map((x: any) => [x.timetable_id, x.substitute_teacher_id])))
    setPreferredRows((pref ?? []) as PreferredSub[])
    setSwaps((swapRows ?? []) as PeriodSwap[])
    setLoading(false)
  }

  useEffect(() => {
    loadForDate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absentTeacherId, date, dayName])

  // Periods that still need a substitute — anything already handled by a
  // swap that day is self-covered and doesn't show up here.
  const slotsToCover = useMemo(
    () => absentSlots.filter((slot) => !swapFor(swaps, absentTeacherId, Number(slot.period))),
    [absentSlots, swaps, absentTeacherId]
  )

  const candidatesBySlot = useMemo(() => {
    const map = new Map<
      number,
      {
        preferredSection: Teacher[]
        sameSubject: Teacher[]
        sameSection: Teacher[]
        other: Teacher[]
        suggested: Teacher | null
        suggestedPrefId: number | null
      }
    >()

    for (const slot of slotsToCover) {
      const slotPeriod = Number(slot.period)
      const busyIds = new Set<string>()
      for (const row of dayTimetable) {
        if (Number(row.period) === slotPeriod && row.teacher_id) busyIds.add(String(row.teacher_id))
      }
      for (const [timetableId, subId] of Object.entries(existingSubs)) {
        const row = dayTimetable.find((r) => r.id === Number(timetableId))
        if (row && Number(row.period) === slotPeriod) busyIds.add(String(subId))
      }

      const eligible = teachers.filter((t) => t.id !== absentTeacherId && !busyIds.has(String(t.id)))

      // A teacher who explicitly marked themselves preferred for THIS exact
      // section on this date — the strongest possible signal, regardless of
      // whether they've historically taught this section.
      const prefRowFor = (teacherId: string) =>
        preferredRows.find((p) => p.teacher_id === teacherId && p.section_id === slot.section_id)

      const preferredSection = eligible.filter((t) => !!prefRowFor(t.id))
      const preferredSectionIds = new Set(preferredSection.map((t) => t.id))

      // Only teachers who actually teach this section (any subject, any
      // period during the week) count for the next two buckets — someone
      // who's never in front of 7B shouldn't rank above the "other" pile
      // just because they're free.
      const teachesSection = (t: Teacher) => teacherTeachesSection(t.id, slot.section_id, fullTimetable)

      const sameSubject = eligible.filter(
        (t) => !preferredSectionIds.has(t.id) && teachesSection(t) && teacherTeachesSubject(t, slot.subject)
      )
      const sameSubjectIds = new Set(sameSubject.map((t) => t.id))

      const sameSection = eligible.filter(
        (t) => !preferredSectionIds.has(t.id) && !sameSubjectIds.has(t.id) && teachesSection(t)
      )
      const sameSectionIds = new Set(sameSection.map((t) => t.id))

      // Last-resort fallback: free, but doesn't teach this section at all.
      // Kept so admin is never fully stuck, but never auto-suggested.
      const other = eligible.filter(
        (t) => !preferredSectionIds.has(t.id) && !sameSubjectIds.has(t.id) && !sameSectionIds.has(t.id)
      )

      const suggested = preferredSection[0] ?? sameSubject[0] ?? sameSection[0] ?? null
      const suggestedPrefId = suggested ? prefRowFor(suggested.id)?.id ?? null : null

      map.set(slot.id, { preferredSection, sameSubject, sameSection, other, suggested, suggestedPrefId })
    }

    return map
  }, [slotsToCover, teachers, dayTimetable, existingSubs, preferredRows, fullTimetable, absentTeacherId])

  // Pre-fill the dropdown with the top suggestion so admin usually just hits Assign.
  useEffect(() => {
    setAssignments((current) => {
      let changed = false
      const next = { ...current }
      for (const slot of slotsToCover) {
        if (existingSubs[slot.id]) continue
        if (next[slot.id]) continue
        const entry = candidatesBySlot.get(slot.id)
        if (entry?.suggested) {
          next[slot.id] = entry.suggested.id
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [candidatesBySlot, slotsToCover, existingSubs])

  async function assign(slot: TimetableSlot) {
    const subId = assignments[slot.id]
    if (!subId) return
    setSaving(slot.id)
    await supabase.from('substitutions').upsert(
      { date, timetable_id: slot.id, original_teacher_id: slot.teacher_id, substitute_teacher_id: subId },
      { onConflict: 'date,timetable_id' }
    )

    // If the teacher we just assigned had marked themselves preferred for
    // this exact section on this date, that preference has now been used —
    // clear it so it doesn't keep showing up as still-pending.
    const usedPref = preferredRows.find((p) => p.teacher_id === subId && p.section_id === slot.section_id)
    if (usedPref) {
      await supabase.from('preferred_substitutions').delete().eq('id', usedPref.id)
    }

    setSaving(null)
    loadForDate()
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Teacher on leave</label>
          <TeacherAutocomplete teachers={teachers} value={absentTeacherId} onChange={setAbsentTeacherId} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
      </div>

      {!absentTeacherId ? (
        <p className="text-sm text-[var(--muted)]">Start typing a name to see their periods for that day.</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : absentSlots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {teacherMap[absentTeacherId]} has no periods on {dayName}, {date}.
        </p>
      ) : (
        <ul className="space-y-3">
          {absentSlots.map((slot) => {
            const swap = swapFor(swaps, absentTeacherId, Number(slot.period))
            if (swap) {
              const { partnerId, partnerPeriod } = swapPartner(swap, absentTeacherId)
              return (
                <li key={slot.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-medium">
                    Period {slot.period} · {slot.subject} · Section {sectionMap[slot.section_id]}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--success)]">
                    Covered via swap — {teacherMap[partnerId] ?? 'another teacher'} takes this period (Period{' '}
                    {partnerPeriod} swapped in return)
                  </p>
                </li>
              )
            }

            const assigned = existingSubs[slot.id]
            const entry = candidatesBySlot.get(slot.id)
            const isSuggested = !!entry?.suggested && assignments[slot.id] === entry.suggested.id

            return (
              <li key={slot.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-sm font-medium">
                  Period {slot.period} · {slot.subject} · Section {sectionMap[slot.section_id]}
                </p>

                {assigned ? (
                  <p className="mt-1 text-sm font-medium text-[var(--success)]">Assigned: {teacherMap[assigned]}</p>
                ) : (
                  <>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={assignments[slot.id] ?? ''}
                        onChange={(e) => setAssignments((a) => ({ ...a, [slot.id]: e.target.value }))}
                        className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <option value="">Select substitute…</option>
                        {entry && entry.preferredSection.length > 0 && (
                          <optgroup label="✓ Marked preferred for this section">
                            {entry.preferredSection.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {entry && entry.sameSubject.length > 0 && (
                          <optgroup label="Teaches this subject to this section">
                            {entry.sameSubject.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {entry && entry.sameSection.length > 0 && (
                          <optgroup label="Teaches this section (other subject)">
                            {entry.sameSection.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {entry && entry.other.length > 0 && (
                          <optgroup label="⚠ Doesn't teach this section — emergency only">
                            {entry.other.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button
                        onClick={() => assign(slot)}
                        disabled={!assignments[slot.id] || saving === slot.id}
                        className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Assign
                      </button>
                    </div>
                    {isSuggested && (
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        Suggested — free that period. Change the dropdown if you&rsquo;d rather pick someone else.
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
