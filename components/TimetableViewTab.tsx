'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PeriodSwap, Section, Teacher, TimetableSlot } from '@/lib/types'
import { swapFor, swapPartner } from '@/lib/periodSwaps'
import { PERIODS, DAYS, todayISO, dayNameForDate } from '@/lib/periods'

export default function TimetableViewTab() {
  const [date, setDate] = useState(todayISO())
  const [sections, setSections] = useState<Section[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherId, setTeacherId] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [subsByTimetableId, setSubsByTimetableId] = useState<Record<number, string>>({})
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [loading, setLoading] = useState(false)

  const todaysDayName = useMemo(() => dayNameForDate(date), [date])

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('sections').select('*').order('class').order('section'),
        supabase.from('teachers').select('*').order('name'),
      ])
      setSections((s ?? []) as Section[])
      setTeachers((t ?? []) as Teacher[])
    }
    loadStatic()
  }, [])

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t) => [t.id, t.name])), [teachers])
  const sectionMap = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.id, `${s.class}${s.section}`])),
    [sections]
  )
  const classOptions = useMemo(
    () => Array.from(new Set(sections.map((s) => s.class))).sort((a, b) => a - b),
    [sections]
  )
  const sectionOptions = useMemo(
    () => sections.filter((s) => !classFilter || s.class === Number(classFilter)),
    [sections, classFilter]
  )

  // Selecting a teacher takes precedence; otherwise fall back to class+section.
  const mode: 'teacher' | 'section' | 'none' = teacherId ? 'teacher' : sectionId ? 'section' : 'none'

  useEffect(() => {
    async function load() {
      if (mode === 'none') {
        setSlots([])
        return
      }
      setLoading(true)

      const { data } =
        mode === 'teacher'
          ? await supabase.from('timetable').select('*').eq('teacher_id', teacherId).order('day').order('period')
          : await supabase
              .from('timetable')
              .select('*')
              .eq('section_id', Number(sectionId))
              .order('day')
              .order('period')
      setSlots((data ?? []) as TimetableSlot[])

      // Pull substitutions + swaps for the selected date so the grid can show
      // coverage info on whichever day-of-week that date falls on.
      const [{ data: subs }, { data: swapRows }] = await Promise.all([
        supabase.from('substitutions').select('*').eq('date', date),
        supabase.from('period_swaps').select('*').eq('swap_date', date),
      ])
      setSubsByTimetableId(Object.fromEntries((subs ?? []).map((s: any) => [s.timetable_id, s.substitute_teacher_id])))
      setSwaps((swapRows ?? []) as PeriodSwap[])

      setLoading(false)
    }
    load()
  }, [mode, teacherId, sectionId, date])

  function clearOtherFilters(next: 'teacher' | 'section') {
    if (next === 'teacher') {
      setClassFilter('')
      setSectionId('')
    } else {
      setTeacherId('')
    }
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Teacher</label>
          <select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value)
              if (e.target.value) clearOtherFilters('teacher')
            }}
            className="input"
          >
            <option value="">Any teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Class</label>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value)
              setSectionId('')
              if (e.target.value) clearOtherFilters('section')
            }}
            className="input"
          >
            <option value="">Any class</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value)
              if (e.target.value) clearOtherFilters('section')
            }}
            className="input"
          >
            <option value="">Any section</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                Class {s.class}
                {s.section}
              </option>
            ))}
          </select>
        </div>
      </div>

      {teacherId && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Showing <span className="font-medium text-[var(--text)]">{teacherMap[teacherId]}</span>&rsquo;s timetable
          across all classes.
        </p>
      )}

      {mode === 'none' ? (
        <p className="text-sm text-[var(--muted)]">Pick a teacher, or a class &amp; section, to see a timetable.</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No periods found for this selection.</p>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-24" />
            {PERIODS.map((p) => (
              <col key={p.period} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-r border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-left text-[11px] font-semibold uppercase text-[var(--muted)]">
                Day
              </th>
              {PERIODS.map((p) => (
                <th
                  key={p.period}
                  className="border-b border-[var(--border)] bg-[var(--surface)] px-1 py-2 text-center text-[11px] font-semibold uppercase text-[var(--muted)]"
                >
                  P{p.period}
                  <div className="mt-0.5 text-[9px] font-normal normal-case text-[var(--muted)]">
                    {p.start}–{p.end}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className={day === todaysDayName ? 'bg-[var(--primary)]/5' : undefined}>
                <td className="border-r border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[11px] font-semibold uppercase text-[var(--muted)]">
                  {day.slice(0, 3)}
                  {day === todaysDayName && (
                    <div className="mt-0.5 text-[9px] font-normal normal-case text-[var(--primary)]">{date}</div>
                  )}
                </td>
                {PERIODS.map((p) => {
                  const slot = slots.find((s) => s.day === day && s.period === p.period)
                  if (!slot) {
                    return (
                      <td
                        key={p.period}
                        className="border-b border-[var(--border)] px-1 py-2 text-center text-xs text-[var(--muted)]"
                      >
                        —
                      </td>
                    )
                  }

                  const subId = day === todaysDayName ? subsByTimetableId[slot.id] : undefined
                  const swap =
                    day === todaysDayName && slot.teacher_id
                      ? swapFor(swaps, slot.teacher_id, Number(slot.period))
                      : undefined

                  return (
                    <td key={p.period} className="border-b border-[var(--border)] px-1.5 py-2 align-top">
                      <div className="truncate text-xs font-medium leading-tight" title={slot.subject}>
                        {slot.subject}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-[var(--muted)]">
                        {mode === 'teacher'
                          ? `Class ${sectionMap[slot.section_id] ?? ''}`
                          : slot.teacher_id
                            ? teacherMap[slot.teacher_id]
                            : 'Unassigned'}
                      </div>
                      {subId && (
                        <div className="mt-1 truncate text-[10px] font-medium text-[var(--danger)]">
                          Sub: {teacherMap[subId] ?? '?'}
                        </div>
                      )}
                      {swap && (
                        <div className="mt-1 truncate text-[10px] font-medium text-[var(--warn)]">
                          Swap: {teacherMap[swapPartner(swap, slot.teacher_id!).partnerId] ?? '?'}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
