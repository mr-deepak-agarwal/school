'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, PreferredSub, Teacher, TimetableSlot } from '@/lib/types'
import { teacherTeachesSubject } from '@/lib/subjectMatch'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function SubstitutionsPage() {
  return (
    <AppShell adminOnly>
      <SubstitutionsContent />
    </AppShell>
  )
}

function SubstitutionsContent() {
  const [date, setDate] = useState(todayISO())
  const [leavesToday, setLeavesToday] = useState<LeaveRequest[]>([])
  const [slotsToCover, setSlotsToCover] = useState<TimetableSlot[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [existingSubs, setExistingSubs] = useState<Record<number, string>>({})
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [preferred, setPreferred] = useState<PreferredSub[]>([])
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [dayTimetable, setDayTimetable] = useState<TimetableSlot[]>([])
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  const dayName = useMemo(() => DAY_NAMES[new Date(date + 'T00:00:00').getDay()], [date])

  useEffect(() => {
    async function loadStatic() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teachers').select('*'),
        supabase.from('sections').select('id, class, section'),
      ])
      setTeachers((t ?? []) as Teacher[])
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
    }
    loadStatic()
  }, [])

  async function loadDay() {
    const { data: leaves } = await supabase.from('leave_register').select('*').eq('date', date).eq('status', 'approved')
    setLeavesToday(leaves ?? [])

    const { data: pref } = await supabase
      .from('preferred_substitutions')
      .select('*')
      .eq('date', date)
      .eq('preferred', true)
    setPreferred(pref ?? [])

    if (leaves && leaves.length > 0) {
      const teacherIds = leaves.map((l) => l.teacher_id)
      const { data: slots } = await supabase
        .from('timetable')
        .select('*')
        .eq('day', dayName)
        .in('teacher_id', teacherIds)
        .order('period')
      setSlotsToCover(slots ?? [])
    } else {
      setSlotsToCover([])
    }

    const [{ data: subs }, { data: dayRows }] = await Promise.all([
      supabase.from('substitutions').select('*').eq('date', date),
      supabase.from('timetable').select('*').eq('day', dayName),
    ])
    setExistingSubs(Object.fromEntries((subs ?? []).map((s: any) => [s.timetable_id, s.substitute_teacher_id])))
    setDayTimetable((dayRows ?? []) as TimetableSlot[])
  }

  useEffect(() => {
    loadDay()
  }, [date, dayName])

  const preferredIds = new Set(preferred.map((p) => p.teacher_id))
  const onLeaveIds = new Set(leavesToday.map((l) => l.teacher_id))

  const candidatesBySlot = useMemo(() => {
    const map = new Map<number, { list: Teacher[]; best: Teacher | null; bestIsConfident: boolean }>()

    for (const slot of slotsToCover) {
      // Teachers already committed at this exact period: either teaching their
      // own class, or already covering a different substitution for it.
      // Compare periods as numbers, not with strict ===. Rows entered through
      // the admin form and rows loaded any other way (bulk import, manual SQL,
      // etc.) can come back from Supabase as a number in one place and a
      // numeric string in another; a strict === silently fails to match those
      // and lets an already-busy teacher slip through as "free".
      const slotPeriod = Number(slot.period)
      const busyIds = new Set<string>()
      for (const row of dayTimetable) {
        if (Number(row.period) === slotPeriod && row.teacher_id) busyIds.add(String(row.teacher_id))
      }
      for (const [timetableId, subId] of Object.entries(existingSubs)) {
        const row = dayTimetable.find((r) => r.id === Number(timetableId))
        if (row && Number(row.period) === slotPeriod) busyIds.add(String(subId))
      }

      const eligible = teachers.filter(
        (t) => t.id !== slot.teacher_id && !onLeaveIds.has(t.id) && !busyIds.has(String(t.id))
      )
      const rank = (t: Teacher) => {
        const subjectMatch = teacherTeachesSubject(t, slot.subject)
        const isPreferred = preferredIds.has(t.id)
        if (subjectMatch && isPreferred) return 0
        if (subjectMatch) return 1
        if (isPreferred) return 2
        return 3
      }
      const sorted = [...eligible].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      const best = sorted[0] ?? null
      // Only worth auto-picking when the top match has some signal behind it
      // (teaches the subject and/or explicitly marked themselves available) —
      // not just "first free teacher alphabetically".
      const bestIsConfident = best !== null && rank(best) <= 2

      map.set(slot.id, { list: sorted, best, bestIsConfident })
    }

    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsToCover, teachers, dayTimetable, existingSubs, preferred, leavesToday, date])

  // Pre-select the best free match (subject teacher and/or someone who marked
  // themselves available) so the admin usually just has to hit Assign.
  useEffect(() => {
    setAssignments((current) => {
      let changed = false
      const next = { ...current }
      for (const slot of slotsToCover) {
        if (existingSubs[slot.id]) continue
        if (next[slot.id]) continue
        const entry = candidatesBySlot.get(slot.id)
        if (entry?.bestIsConfident && entry.best) {
          next[slot.id] = entry.best.id
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
      {
        date,
        timetable_id: slot.id,
        original_teacher_id: slot.teacher_id,
        substitute_teacher_id: subId,
      },
      { onConflict: 'date,timetable_id' }
    )
    setSaving(null)
    loadDay()
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Substitutions</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-sm"
        />
      </div>

      {leavesToday.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No one is on leave for {dayName}, {date}.</p>
      ) : slotsToCover.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Teachers on leave have no periods that day.</p>
      ) : (
        <ul className="space-y-3">
          {slotsToCover.map((slot) => {
            const assigned = existingSubs[slot.id]
            const entry = candidatesBySlot.get(slot.id)
            const sorted = entry?.list ?? []
            const isSuggested = !!entry?.bestIsConfident && assignments[slot.id] === entry.best?.id

            return (
              <li key={slot.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-sm font-medium">
                  Period {slot.period} · {slot.subject} · Section {sectionMap[slot.section_id]}
                </p>
                <p className="mb-3 text-sm text-[var(--muted)]">
                  Regular teacher: {slot.teacher_id ? teacherMap[slot.teacher_id] : 'Unassigned'} (on leave)
                </p>

                {assigned ? (
                  <p className="text-sm font-medium text-[var(--success)]">Assigned: {teacherMap[assigned]}</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <select
                        value={assignments[slot.id] ?? ''}
                        onChange={(e) => setAssignments((a) => ({ ...a, [slot.id]: e.target.value }))}
                        className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <option value="">Select substitute…</option>
                        {sorted.map((t) => {
                          const tags = []
                          if (teacherTeachesSubject(t, slot.subject)) tags.push('teaches subject')
                          if (preferredIds.has(t.id)) tags.push('available')
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {tags.length ? ` (${tags.join(', ')})` : ''}
                            </option>
                          )
                        })}
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