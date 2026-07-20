'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, PreferredSub, Teacher, TimetableSlot } from '@/lib/types'

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
    const { data: leaves } = await supabase.from('leave_register').select('*').eq('date', date)
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

    const { data: subs } = await supabase.from('substitutions').select('*').eq('date', date)
    setExistingSubs(Object.fromEntries((subs ?? []).map((s: any) => [s.timetable_id, s.substitute_teacher_id])))
  }

  useEffect(() => {
    loadDay()
  }, [date, dayName])

  const preferredIds = new Set(preferred.map((p) => p.teacher_id))
  const onLeaveIds = new Set(leavesToday.map((l) => l.teacher_id))

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
            const eligible = teachers.filter((t) => t.id !== slot.teacher_id && !onLeaveIds.has(t.id))
            const sorted = [...eligible].sort((a, b) => {
              const aPref = preferredIds.has(a.id) ? 0 : 1
              const bPref = preferredIds.has(b.id) ? 0 : 1
              return aPref - bPref
            })

            return (
              <li key={slot.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-sm font-medium">
                  Period {slot.period} · {slot.subject} · Section {sectionMap[slot.section_id]}
                </p>
                <p className="mb-3 text-sm text-[var(--muted)]">
                  Regular teacher: {teacherMap[slot.teacher_id]} (on leave)
                </p>

                {assigned ? (
                  <p className="text-sm font-medium text-[var(--success)]">Assigned: {teacherMap[assigned]}</p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={assignments[slot.id] ?? ''}
                      onChange={(e) => setAssignments((a) => ({ ...a, [slot.id]: e.target.value }))}
                      className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Select substitute…</option>
                      {sorted.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {preferredIds.has(t.id) ? ' (available)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assign(slot)}
                      disabled={!assignments[slot.id] || saving === slot.id}
                      className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Assign
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
