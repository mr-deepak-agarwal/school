'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import type { Substitution, TimetableSlot } from '@/lib/types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function TimetablePage() {
  return (
    <AppShell>
      <TimetableContent />
    </AppShell>
  )
}

function TimetableContent() {
  const { teacher } = useCurrentTeacher()
  const [date, setDate] = useState(todayISO())
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [subsOut, setSubsOut] = useState<Substitution[]>([]) // my periods someone else is covering
  const [subsIn, setSubsIn] = useState<(Substitution & { slot?: TimetableSlot })[]>([]) // periods I'm covering
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const dayName = useMemo(() => DAY_NAMES[new Date(date + 'T00:00:00').getDay()], [date])

  useEffect(() => {
    async function loadLookups() {
      const [{ data: teachers }, { data: sections }] = await Promise.all([
        supabase.from('teachers').select('id, name'),
        supabase.from('sections').select('id, class, section'),
      ])
      setTeacherMap(Object.fromEntries((teachers ?? []).map((t: any) => [t.id, t.name])))
      setSectionMap(Object.fromEntries((sections ?? []).map((s: any) => [s.id, `${s.class}${s.section}`])))
    }
    loadLookups()
  }, [])

  useEffect(() => {
    if (!teacher) return

    async function loadDay() {
      setLoading(true)

      const { data: timetableRows } = await supabase
        .from('timetable')
        .select('*')
        .eq('teacher_id', teacher!.id)
        .eq('day', dayName)
        .order('period')

      const { data: outgoing } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', date)
        .eq('original_teacher_id', teacher!.id)

      const { data: incoming } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', date)
        .eq('substitute_teacher_id', teacher!.id)

      let incomingWithSlot: (Substitution & { slot?: TimetableSlot })[] = []
      if (incoming && incoming.length > 0) {
        const timetableIds = incoming.map((s) => s.timetable_id)
        const { data: incomingSlots } = await supabase.from('timetable').select('*').in('id', timetableIds)
        incomingWithSlot = incoming.map((s) => ({
          ...s,
          slot: incomingSlots?.find((slot) => slot.id === s.timetable_id),
        }))
      }

      setSlots(timetableRows ?? [])
      setSubsOut(outgoing ?? [])
      setSubsIn(incomingWithSlot)
      setLoading(false)
    }

    loadDay()
  }, [teacher, date, dayName])

  const coveredTimetableIds = new Set(subsOut.map((s) => s.timetable_id))

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{dayName}</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : slots.length === 0 && subsIn.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No periods scheduled.</p>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => {
            const isCovered = coveredTimetableIds.has(slot.id)
            const coveringSub = subsOut.find((s) => s.timetable_id === slot.id)
            return (
              <li
                key={slot.id}
                className={`rounded-lg border p-4 ${
                  isCovered
                    ? 'border-[var(--warn)] bg-[var(--warn-bg)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Period {slot.period}</span>
                  {slot.start_time && (
                    <span className="text-xs text-[var(--muted)]">{slot.start_time.slice(0, 5)}</span>
                  )}
                </div>
                <p className="mt-1 text-base font-semibold">{slot.subject}</p>
                <p className="text-sm text-[var(--muted)]">Section {sectionMap[slot.section_id]}</p>
                {isCovered && (
                  <p className="mt-2 text-sm font-medium text-[var(--warn)]">
                    Covered by {teacherMap[coveringSub!.substitute_teacher_id] ?? 'another teacher'}
                  </p>
                )}
              </li>
            )
          })}

          {subsIn.map((s) => (
            <li
              key={`in-${s.id}`}
              className="rounded-lg border border-[var(--primary)] bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Period {s.slot?.period ?? '?'}</span>
                {s.slot?.start_time && (
                  <span className="text-xs text-[var(--muted)]">{s.slot.start_time.slice(0, 5)}</span>
                )}
              </div>
              <p className="mt-1 text-base font-semibold">{s.slot?.subject}</p>
              <p className="text-sm text-[var(--muted)]">
                Section {s.slot ? sectionMap[s.slot.section_id] : ''}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--primary)]">
                Covering for {teacherMap[s.original_teacher_id] ?? 'a teacher'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
