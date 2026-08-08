'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, PeriodSwap, PreferredSub, Teacher, TimetableSlot } from '@/lib/types'
import { teacherTeachesSection, teacherTeachesSubject } from '@/lib/subjectMatch'
import { swapFor, swapPartner } from '@/lib/periodSwaps'
import { todayISO, dayNameForDate, toISO } from '@/lib/periods'
import {
  occupiedPeriods,
  checkWorkload,
  MAX_PERIODS_PER_DAY,
  MAX_CONTINUOUS_PERIODS,
  FREQUENT_ABSENCE_THRESHOLD,
  FREQUENT_ABSENCE_WINDOW_DAYS,
} from '@/lib/workload'
import { maybeAutoMarkPreferred } from '@/lib/autoPreferred'
import { computeAutoAssignments, commitAutoAssignments, type AutoAssignResult } from '@/lib/autoAssignSubstitutions'
import TeacherAutocomplete from './TeacherAutocomplete'

type SubRow = { id: number; substitute_teacher_id: string }

type DaySubRow = {
  id: number
  timetable_id: number
  period: number
  section_id: number
  subject: string
  original_teacher_id: string
  substitute_teacher_id: string
}

export default function SubstitutionsTab() {
  const [date, setDate] = useState(todayISO())
  const [absentTeacherId, setAbsentTeacherId] = useState('')

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [fullTimetable, setFullTimetable] = useState<TimetableSlot[]>([])

  // Leave-entry flow — this is the starting point: mark who's absent
  // today, and their name drives everything below.
  const [leaveToday, setLeaveToday] = useState<LeaveRequest[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [newAbsentId, setNewAbsentId] = useState('')
  const [markingAbsent, setMarkingAbsent] = useState(false)
  const [showManualPicker, setShowManualPicker] = useState(false)

  // A frequent-absence auto-assign never writes straight to the database —
  // it's computed, shown here for the admin to look over, and only saved
  // if they explicitly confirm it.
  const [pendingAutoAssign, setPendingAutoAssign] = useState<{ teacherId: string; result: AutoAssignResult } | null>(
    null
  )
  const [applyingAutoAssign, setApplyingAutoAssign] = useState(false)
  const [autoNotice, setAutoNotice] = useState<string | null>(null)

  // Every substitution already on the books for the selected date, shown
  // up front regardless of which teacher (if any) is selected below.
  const [daySubs, setDaySubs] = useState<DaySubRow[]>([])
  const [daySubsLoading, setDaySubsLoading] = useState(false)

  const [absentSlots, setAbsentSlots] = useState<TimetableSlot[]>([])
  const [dayTimetable, setDayTimetable] = useState<TimetableSlot[]>([])
  const [existingSubs, setExistingSubs] = useState<Record<number, SubRow>>({})
  const [preferredRows, setPreferredRows] = useState<PreferredSub[]>([])
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [autoPreferredNotes, setAutoPreferredNotes] = useState<Record<number, string>>({})
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

  async function loadLeaveForDate() {
    setLeaveLoading(true)
    const { data } = await supabase.from('leave_register').select('*').eq('date', date).order('id')
    setLeaveToday((data ?? []) as LeaveRequest[])
    setLeaveLoading(false)
  }

  // Independent of which teacher is selected below — a standing summary of
  // everything already substituted for this date, so the admin can see the
  // whole day's coverage at a glance without clicking into each teacher.
  async function loadDaySubs() {
    setDaySubsLoading(true)
    const [{ data: subs }, { data: dayRows }] = await Promise.all([
      supabase.from('substitutions').select('*').eq('date', date),
      supabase.from('timetable').select('*').eq('day', dayName),
    ])
    const rowById = Object.fromEntries(((dayRows ?? []) as any[]).map((r) => [r.id, r]))
    const rows = ((subs ?? []) as any[])
      .map((s) => {
        const row = rowById[s.timetable_id]
        if (!row) return null
        return {
          id: s.id,
          timetable_id: s.timetable_id,
          period: Number(row.period),
          section_id: row.section_id,
          subject: row.subject,
          original_teacher_id: s.original_teacher_id,
          substitute_teacher_id: s.substitute_teacher_id,
        } as DaySubRow
      })
      .filter((r): r is DaySubRow => r !== null)
      .sort((a, b) => a.period - b.period)
    setDaySubs(rows)
    setDaySubsLoading(false)
  }

  useEffect(() => {
    loadLeaveForDate()
    loadDaySubs()
    setAutoNotice(null)
    setPendingAutoAssign(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dayName])

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
        supabase.from('preferred_substitutions').select('*').eq('preferred', true).eq('fulfilled', false),
        supabase.from('period_swaps').select('*').eq('swap_date', date),
      ])

    setAbsentSlots((mySlots ?? []) as TimetableSlot[])
    setDayTimetable((dayRows ?? []) as TimetableSlot[])
    setExistingSubs(
      Object.fromEntries(
        (subs ?? []).map((x: any) => [x.timetable_id, { id: x.id, substitute_teacher_id: x.substitute_teacher_id }])
      )
    )
    setPreferredRows((pref ?? []) as PreferredSub[])
    setSwaps((swapRows ?? []) as PeriodSwap[])
    setEditingSlotId(null)
    setLoading(false)
  }

  useEffect(() => {
    loadForDate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absentTeacherId, date, dayName])

  // ---- Leave-entry flow -------------------------------------------------

  async function markAbsent(teacherId: string) {
    if (!teacherId) return
    setMarkingAbsent(true)
    setAutoNotice(null)
    setPendingAutoAssign(null)

    const { error } = await supabase
      .from('leave_register')
      .upsert({ date, teacher_id: teacherId, status: 'approved' }, { onConflict: 'date,teacher_id' })

    if (error) {
      console.error('Failed to mark teacher absent', error)
      setMarkingAbsent(false)
      return
    }

    // Chronic-absence check: how many times has this teacher been marked
    // absent in the last FREQUENT_ABSENCE_WINDOW_DAYS? If it crosses the
    // threshold, work out a proposed set of substitutions — but don't save
    // anything yet. The admin reviews and explicitly approves it below.
    const cutoff = new Date(date + 'T00:00:00')
    cutoff.setDate(cutoff.getDate() - FREQUENT_ABSENCE_WINDOW_DAYS)
    const { count } = await supabase
      .from('leave_register')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .gte('date', toISO(cutoff))

    setNewAbsentId('')
    setAbsentTeacherId(teacherId)
    await loadLeaveForDate()

    if ((count ?? 0) >= FREQUENT_ABSENCE_THRESHOLD) {
      const result = await computeAutoAssignments(teacherId, date)
      if (result.assigned.length > 0) {
        setPendingAutoAssign({ teacherId, result })
      }
    }

    setMarkingAbsent(false)
  }

  async function confirmAutoAssign() {
    if (!pendingAutoAssign) return
    setApplyingAutoAssign(true)
    const { teacherId, result } = pendingAutoAssign
    await commitAutoAssignments(date, result.assigned)
    setAutoNotice(
      `Applied — ${teacherMap[teacherId] ?? 'this teacher'}'s periods were substituted (${result.assigned.length} covered${
        result.unassigned.length ? `, ${result.unassigned.length} still need a pick` : ''
      }).`
    )
    setPendingAutoAssign(null)
    setApplyingAutoAssign(false)
    await Promise.all([loadForDate(), loadDaySubs()])
  }

  function dismissAutoAssign() {
    setPendingAutoAssign(null)
  }

  async function unmarkAbsent(id: number) {
    await supabase.from('leave_register').delete().eq('id', id)
    loadLeaveForDate()
  }

  // Periods that still need a substitute — anything already handled by a
  // swap that day is self-covered and doesn't show up here.
  const slotsToCover = useMemo(
    () => absentSlots.filter((slot) => !swapFor(swaps, absentTeacherId, Number(slot.period))),
    [absentSlots, swaps, absentTeacherId]
  )

  // teacher -> extra periods they're already covering as a substitute
  // today (on top of their normal timetable), for workload math.
  const extraSubPeriodsByTeacher = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const [timetableId, sub] of Object.entries(existingSubs)) {
      const row = dayTimetable.find((r) => r.id === Number(timetableId))
      if (!row) continue
      const arr = map.get(sub.substitute_teacher_id) ?? []
      arr.push(Number(row.period))
      map.set(sub.substitute_teacher_id, arr)
    }
    return map
  }, [existingSubs, dayTimetable])

  const candidatesBySlot = useMemo(() => {
    const map = new Map<
      number,
      {
        preferredSection: Teacher[]
        sameSubject: Teacher[]
        sameSection: Teacher[]
        other: Teacher[]
        overCapacity: Teacher[]
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
      for (const [timetableId, sub] of Object.entries(existingSubs)) {
        const row = dayTimetable.find((r) => r.id === Number(timetableId))
        if (row && Number(row.period) === slotPeriod) busyIds.add(String(sub.substitute_teacher_id))
      }

      const eligible = teachers.filter((t) => t.id !== absentTeacherId && !busyIds.has(String(t.id)))

      const withinCapacity = (t: Teacher) => {
        const occ = occupiedPeriods(t.id, dayTimetable, extraSubPeriodsByTeacher.get(t.id) ?? [])
        const check = checkWorkload(occ, slotPeriod)
        return !check.exceedsDaily && !check.exceedsContinuous
      }

      // A teacher who explicitly marked themselves preferred for THIS exact
      // section (and hasn't already used that preference) — the strongest
      // possible signal, regardless of whether they've historically taught
      // this section.
      const prefRowFor = (teacherId: string) =>
        preferredRows.find((p) => p.teacher_id === teacherId && p.section_id === slot.section_id)

      const overCapacity = eligible.filter((t) => !withinCapacity(t))
      const capacityOk = eligible.filter((t) => withinCapacity(t))

      const preferredSection = capacityOk.filter((t) => !!prefRowFor(t.id))
      const preferredSectionIds = new Set(preferredSection.map((t) => t.id))

      // Only teachers who actually teach this section (any subject, any
      // period during the week) count for the next two buckets — someone
      // who's never in front of 7B shouldn't rank above the "other" pile
      // just because they're free.
      const teachesSection = (t: Teacher) => teacherTeachesSection(t.id, slot.section_id, fullTimetable)

      const sameSubject = capacityOk.filter(
        (t) => !preferredSectionIds.has(t.id) && teachesSection(t) && teacherTeachesSubject(t, slot.subject)
      )
      const sameSubjectIds = new Set(sameSubject.map((t) => t.id))

      const sameSection = capacityOk.filter(
        (t) => !preferredSectionIds.has(t.id) && !sameSubjectIds.has(t.id) && teachesSection(t)
      )
      const sameSectionIds = new Set(sameSection.map((t) => t.id))

      // Last-resort fallback: free, but doesn't teach this section at all.
      // Kept so admin is never fully stuck, but never auto-suggested.
      const other = capacityOk.filter(
        (t) => !preferredSectionIds.has(t.id) && !sameSubjectIds.has(t.id) && !sameSectionIds.has(t.id)
      )

      const suggested = preferredSection[0] ?? sameSubject[0] ?? sameSection[0] ?? null
      const suggestedPrefId = suggested ? prefRowFor(suggested.id)?.id ?? null : null

      map.set(slot.id, { preferredSection, sameSubject, sameSection, other, overCapacity, suggested, suggestedPrefId })
    }

    return map
  }, [slotsToCover, teachers, dayTimetable, existingSubs, preferredRows, fullTimetable, absentTeacherId, extraSubPeriodsByTeacher])

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
    // this exact section, that preference has now been used — flag it as
    // fulfilled (rather than deleting it) so it's kept as a record but no
    // longer bumps this teacher to the top of the list for that section.
    const usedPref = preferredRows.find((p) => p.teacher_id === subId && p.section_id === slot.section_id)
    if (usedPref) {
      await supabase.from('preferred_substitutions').update({ fulfilled: true }).eq('id', usedPref.id)
    }

    // Frequent-cover check: if this teacher has now covered this section
    // enough times, opt them in as a preferred substitute for it going
    // forward, automatically.
    const becamePreferred = await maybeAutoMarkPreferred(subId, slot.section_id)
    if (becamePreferred) {
      setAutoPreferredNotes((n) => ({
        ...n,
        [slot.id]: `✓ ${teacherMap[subId] ?? 'This teacher'} has now covered Class ${sectionMap[slot.section_id]} enough times to be auto-marked preferred for it.`,
      }))
    }

    setSaving(null)
    setEditingSlotId(null)
    await Promise.all([loadForDate(), loadDaySubs()])
  }

  async function removeSubstitution(slot: TimetableSlot) {
    const existing = existingSubs[slot.id]
    if (!existing) return
    setSaving(slot.id)
    await supabase.from('substitutions').delete().eq('id', existing.id)
    setSaving(null)
    setEditingSlotId(null)
    await Promise.all([loadForDate(), loadDaySubs()])
  }

  function startEdit(slot: TimetableSlot) {
    const existing = existingSubs[slot.id]
    if (existing) setAssignments((a) => ({ ...a, [slot.id]: existing.substitute_teacher_id }))
    setEditingSlotId(slot.id)
  }

  return (
    <div>
      {/* ---- Step 1: who's absent today ---- */}
      <div className="card mb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-label mb-0">Teachers on leave · {dayName}</h2>
          <div>
            <label className="mr-2 text-xs font-medium text-[var(--muted)]">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input inline-block w-auto" />
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <TeacherAutocomplete teachers={teachers} value={newAbsentId} onChange={setNewAbsentId} placeholder="Mark a teacher absent…" />
          </div>
          <button
            onClick={() => markAbsent(newAbsentId)}
            disabled={!newAbsentId || markingAbsent}
            className="btn-primary sm:w-auto"
          >
            {markingAbsent ? 'Marking…' : '+ Mark absent'}
          </button>
        </div>

        {leaveLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : leaveToday.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No one has been marked absent for this date yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {leaveToday.map((l) => (
              <div key={l.id} className="animate-fade-in">
                <button
                  onClick={() => setAbsentTeacherId(l.teacher_id)}
                  className={`chip ${absentTeacherId === l.teacher_id ? 'chip-active' : ''}`}
                >
                  {teacherMap[l.teacher_id] ?? 'Unknown teacher'}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      unmarkAbsent(l.id)
                    }}
                    className={`ml-1 rounded-full px-1 text-xs leading-none ${
                      absentTeacherId === l.teacher_id ? 'text-white/70 hover:text-white' : 'text-[var(--muted)] hover:text-[var(--danger)]'
                    }`}
                    title="Remove from today's leave list"
                  >
                    ×
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowManualPicker((v) => !v)}
          className="mt-3 text-xs font-medium text-[var(--muted)] hover:text-[var(--primary)]"
        >
          {showManualPicker ? '– Hide manual search' : 'Not on the list? Search any teacher →'}
        </button>
        {showManualPicker && (
          <div className="mt-2 max-w-sm animate-fade-in">
            <TeacherAutocomplete teachers={teachers} value={absentTeacherId} onChange={setAbsentTeacherId} placeholder="Search any teacher…" />
          </div>
        )}
      </div>

      {/* ---- Frequent-absence proposal: nothing is saved until confirmed ---- */}
      {pendingAutoAssign && (
        <div className="card mb-5 border-[var(--accent)]/50 animate-fade-in">
          <div className="mb-1 flex items-center gap-2">
            <span className="badge-accent">Needs your OK</span>
            <p className="text-sm font-medium">
              {teacherMap[pendingAutoAssign.teacherId] ?? 'This teacher'} has been absent often lately — here&rsquo;s a
              proposed set of substitutes. Nothing has been saved yet.
            </p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {pendingAutoAssign.result.assigned.map((a) => (
              <li key={a.slot.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-[var(--muted)]">Period {a.slot.period}</span>
                <span className="shrink-0">
                  Class {sectionMap[a.slot.section_id]} · {a.slot.subject}
                </span>
                <span className="text-[var(--muted)]">→</span>
                <span className="font-medium">{a.teacher.name}</span>
                {a.viaPreference && <span className="badge-success">Preferred</span>}
              </li>
            ))}
          </ul>
          {pendingAutoAssign.result.unassigned.length > 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {pendingAutoAssign.result.unassigned.length} period(s) couldn&rsquo;t be matched automatically and will
              need a manual pick below either way.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={confirmAutoAssign} disabled={applyingAutoAssign} className="btn-primary">
              {applyingAutoAssign ? 'Applying…' : 'Looks good — apply these'}
            </button>
            <button onClick={dismissAutoAssign} disabled={applyingAutoAssign} className="btn-secondary">
              No, I&rsquo;ll assign manually
            </button>
          </div>
        </div>
      )}

      {autoNotice && (
        <div className="card mb-5 border-[var(--success)]/40 bg-[var(--success-bg)] text-sm text-[var(--text)]">
          <span className="badge-success mr-2">Done</span>
          {autoNotice}
        </div>
      )}

      {/* ---- Today's substitutions, at a glance ---- */}
      <div className="card mb-5">
        <h2 className="section-label mb-3">
          Substitutions for {dayName}, {date}
        </h2>
        {daySubsLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : daySubs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No substitutions recorded yet for this date.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {daySubs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm first:pt-0 last:pb-0">
                <span className="w-16 shrink-0 text-[var(--muted)]">Period {s.period}</span>
                <span className="shrink-0">
                  Class {sectionMap[s.section_id]} · {s.subject}
                </span>
                <span className="text-[var(--muted)]">
                  {teacherMap[s.original_teacher_id] ?? 'Unknown'} <span aria-hidden>→</span>
                </span>
                <span className="font-medium">{teacherMap[s.substitute_teacher_id] ?? 'Unknown'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Step 2: their timetable + substitution picks ---- */}
      {!absentTeacherId ? (
        <p className="text-sm text-[var(--muted)]">Mark a teacher absent above, or pick one, to see their periods for that day.</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : absentSlots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {teacherMap[absentTeacherId]} has no periods on {dayName}, {date}.
        </p>
      ) : (
        <>
          <h3 className="section-label">
            {teacherMap[absentTeacherId]}&rsquo;s timetable — {dayName}, {date}
          </h3>
          <ul className="space-y-3">
            {absentSlots.map((slot) => {
              const swap = swapFor(swaps, absentTeacherId, Number(slot.period))
              if (swap) {
                const { partnerId, partnerPeriod } = swapPartner(swap, absentTeacherId)
                return (
                  <li key={slot.id} className="card">
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
              const isEditing = editingSlotId === slot.id

              return (
                <li key={slot.id} className="card card-hover">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      Period {slot.period} · {slot.subject} · Section {sectionMap[slot.section_id]}
                    </p>
                    {assigned && !isEditing && <span className="badge-success shrink-0">Covered</span>}
                  </div>

                  {assigned && !isEditing ? (
                    <>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--success)]">
                          Assigned: {teacherMap[assigned.substitute_teacher_id]}
                        </p>
                        <button onClick={() => startEdit(slot)} className="btn-ghost btn-sm">
                          Edit
                        </button>
                        <button
                          onClick={() => removeSubstitution(slot)}
                          disabled={saving === slot.id}
                          className="btn-ghost btn-sm text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                        >
                          Remove
                        </button>
                      </div>
                      {autoPreferredNotes[slot.id] && (
                        <p className="mt-1.5 text-xs text-[var(--accent)]">{autoPreferredNotes[slot.id]}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mt-2 flex gap-2">
                        <select
                          value={assignments[slot.id] ?? ''}
                          onChange={(e) => setAssignments((a) => ({ ...a, [slot.id]: e.target.value }))}
                          className="input flex-1"
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
                          {entry && entry.overCapacity.length > 0 && (
                            <optgroup
                              label={`⚠ Over workload limit (${MAX_PERIODS_PER_DAY}/day, ${MAX_CONTINUOUS_PERIODS} in a row) — emergency only`}
                            >
                              {entry.overCapacity.map((t) => (
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
                          className="btn-primary"
                        >
                          {isEditing ? 'Save' : 'Assign'}
                        </button>
                        {isEditing && (
                          <button onClick={() => setEditingSlotId(null)} className="btn-secondary">
                            Cancel
                          </button>
                        )}
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
        </>
      )}
    </div>
  )
}
