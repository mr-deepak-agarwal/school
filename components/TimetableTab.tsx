'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Section, Teacher, TimetableSlot } from '@/lib/types'
// DAYS and PERIODS live in one place (lib/periods.ts) — this used to keep a
// second, hand-copied set of period times here, which meant a schedule
// change (e.g. moving the lunch break) had to be made in two files or the
// Timetable and Substitutions tabs would quietly disagree with each other.
import { DAYS, PERIODS } from '@/lib/periods'

export default function TimetableTab() {
  const [sections, setSections] = useState<Section[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [form, setForm] = useState({
    day: 'Monday',
    period: '',
    subject: '',
    teacher_id: '',
  })
  const [error, setError] = useState('')

  // 'week' is the original full-grid builder — good on a wide screen for
  // adding periods anywhere at once. 'day' shows one weekday as a stacked,
  // fill-in-the-blank list of periods — the friendlier way to build a
  // section's timetable from scratch on a phone, one period at a time,
  // the way the paper timetables in the photos actually get filled in.
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [activeDay, setActiveDay] = useState(DAYS[0])
  const [addingPeriod, setAddingPeriod] = useState<number | null>(null)
  const [dayForm, setDayForm] = useState({ subject: '', teacher_id: '' })
  const [dayError, setDayError] = useState('')

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }, { data: allSlots }] = await Promise.all([
        supabase.from('sections').select('*').order('class').order('section'),
        supabase.from('teachers').select('*').order('name'),
        supabase.from('timetable').select('subject'),
      ])
      setSections((s ?? []) as Section[])
      setTeachers((t ?? []) as Teacher[])
      if (s && s.length > 0) setSectionId(s[0].id)

      // Subject dropdown options: every subject any teacher can teach,
      // plus every subject already used anywhere in the timetable (picks
      // up non-teacher periods like Sports, Library, Self Study, Class
      // Test, HOA, LA that don't belong to any teacher's subject list).
      const fromTeachers = ((t ?? []) as Teacher[]).flatMap((teacher) => teacher.subjects ?? [])
      const fromTimetable = ((allSlots ?? []) as { subject: string }[]).map((row) => row.subject)
      const all = Array.from(new Set([...fromTeachers, ...fromTimetable])).sort((a, b) => a.localeCompare(b))
      setSubjects(all)
    }
    loadStatic()
  }, [])

  async function loadSlots() {
    if (!sectionId) return
    const { data } = await supabase
      .from('timetable')
      .select('*')
      .eq('section_id', sectionId)
      .order('day')
      .order('period')
    setSlots((data ?? []) as TimetableSlot[])
  }

  useEffect(() => {
    loadSlots()
  }, [sectionId])

  async function addSlot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sectionId || !form.period || !form.subject) return

    const periodInfo = PERIODS.find((p) => p.period === Number(form.period))

    const { error } = await supabase.from('timetable').insert({
      day: form.day,
      period: Number(form.period),
      subject: form.subject,
      teacher_id: form.teacher_id || null,
      section_id: sectionId,
      start_time: periodInfo?.start ?? null,
      end_time: periodInfo?.end ?? null,
    })

    if (error) {
      setError(error.message)
      return
    }

    setForm({ day: form.day, period: '', subject: '', teacher_id: '' })
    loadSlots()
  }

  // Same insert as addSlot, but driven by the day view's inline per-period
  // "+" rather than the week view's top form — day/period come from which
  // row was tapped instead of select inputs.
  async function addSlotForDay(period: number) {
    setDayError('')
    if (!sectionId || !dayForm.subject) return

    const periodInfo = PERIODS.find((p) => p.period === period)

    const { error } = await supabase.from('timetable').insert({
      day: activeDay,
      period,
      subject: dayForm.subject,
      teacher_id: dayForm.teacher_id || null,
      section_id: sectionId,
      start_time: periodInfo?.start ?? null,
      end_time: periodInfo?.end ?? null,
    })

    if (error) {
      setDayError(error.message)
      return
    }

    setDayForm({ subject: '', teacher_id: '' })
    setAddingPeriod(null)
    loadSlots()
  }

  async function removeSlot(id: number) {
    await supabase.from('timetable').delete().eq('id', id)
    loadSlots()
  }

  async function updateSlotTeacher(id: number, teacherId: string) {
    await supabase
      .from('timetable')
      .update({ teacher_id: teacherId || null })
      .eq('id', id)
    loadSlots()
  }

  async function updateSlotSubject(id: number, subject: string) {
    if (!subject) return
    setSubjects((prev) => (prev.includes(subject) ? prev : [...prev, subject].sort((a, b) => a.localeCompare(b))))
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, subject } : s)))
    const { error } = await supabase.from('timetable').update({ subject }).eq('id', id)
    if (error) loadSlots()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <select value={sectionId ?? ''} onChange={(e) => setSectionId(Number(e.target.value))} className="input max-w-xs">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Class {s.class}
                {s.section}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              viewMode === 'week' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
            }`}
          >
            Week grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              viewMode === 'day' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
            }`}
          >
            Day by day
          </button>
        </div>
      </div>

      {viewMode === 'day' && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setActiveDay(d)
                setAddingPeriod(null)
              }}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                activeDay === d ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'day' ? (
        <div className="space-y-2">
          {dayError && <p className="text-sm text-[var(--danger)]">{dayError}</p>}
          {PERIODS.map((p) => {
            const slot = slots.find((s) => s.day === activeDay && s.period === p.period)

            return (
              <div key={p.period} className="card !py-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-sm font-bold">P{p.period}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {p.start}–{p.end}
                    </div>
                  </div>
                  <div className="h-8 w-px shrink-0 bg-[var(--border)]" />

                  {slot ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <select
                        value={slot.subject}
                        onChange={(e) => updateSlotSubject(slot.id, e.target.value)}
                        className="input flex-1 py-1.5 text-sm font-medium"
                      >
                        {!subjects.includes(slot.subject) && <option value={slot.subject}>{slot.subject}</option>}
                        {subjects.map((subj) => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      <select
                        value={slot.teacher_id ?? ''}
                        onChange={(e) => updateSlotTeacher(slot.id, e.target.value)}
                        className="input flex-1 py-1.5 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeSlot(slot.id)}
                        className="btn-ghost btn-sm shrink-0 !text-[var(--danger)]"
                        title="Remove period"
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ) : addingPeriod === p.period ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <select
                        autoFocus
                        value={dayForm.subject}
                        onChange={(e) => setDayForm({ ...dayForm, subject: e.target.value })}
                        className="input flex-1 py-1.5 text-sm font-medium"
                      >
                        <option value="" disabled>
                          Choose a subject…
                        </option>
                        {subjects.map((subj) => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      <select
                        value={dayForm.teacher_id}
                        onChange={(e) => setDayForm({ ...dayForm, teacher_id: e.target.value })}
                        className="input flex-1 py-1.5 text-sm"
                      >
                        <option value="">Unassigned — allocate later</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => addSlotForDay(p.period)}
                          disabled={!dayForm.subject}
                          className="btn-primary btn-sm"
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setAddingPeriod(null)
                            setDayError('')
                          }}
                          className="btn-secondary btn-sm"
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingPeriod(p.period)
                        setDayForm({ subject: '', teacher_id: '' })
                        setDayError('')
                      }}
                      className="btn-secondary btn-sm"
                      type="button"
                    >
                      + Add period
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
      <>
      <form
        onSubmit={addSlot}
        className="mb-6 grid grid-cols-2 gap-3 card sm:grid-cols-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Day</label>
          <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="input">
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Period</label>
          <select
            required
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })}
            className="input"
          >
            <option value="" disabled>
              Choose a period…
            </option>
            {PERIODS.map((p) => (
              <option key={p.period} value={p.period}>
                P{p.period} · {p.start}–{p.end}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <select
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="input"
          >
            <option value="" disabled>
              Choose a subject…
            </option>
            {subjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Teacher (optional)</label>
          <select
            value={form.teacher_id}
            onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
            className="input"
          >
            <option value="">Unassigned — allocate later</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" className="btn-primary">
            Add period
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-strong)]">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-20" />
            {PERIODS.map((p) => (
              <col key={p.period} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-r border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-left text-xs font-semibold uppercase text-[var(--muted)]">
                Day
              </th>
              {PERIODS.map((p) => (
                <th
                  key={p.period}
                  className="border-b border-r border-[var(--border-strong)] bg-[var(--surface)] px-1 py-2 text-center text-xs font-semibold uppercase text-[var(--muted)] last:border-r-0"
                >
                  P{p.period}
                  <div className="mt-0.5 text-[11px] font-normal normal-case text-[var(--muted)]">
                    {p.start}–{p.end}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="border-r border-b border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-xs font-semibold uppercase text-[var(--muted)]">
                  {day.slice(0, 3)}
                </td>
                {PERIODS.map((p) => {
                  const slot = slots.find((s) => s.day === day && s.period === p.period)
                  if (!slot) {
                    return (
                      <td
                        key={p.period}
                        className="border-b border-r border-[var(--border-strong)] px-1 py-2 text-center text-sm text-[var(--muted)] last:border-r-0"
                      >
                        —
                      </td>
                    )
                  }
                  return (
                    <td key={p.period} className="border-b border-r border-[var(--border-strong)] px-1.5 py-2 align-top last:border-r-0">
                      <div className="flex flex-col items-stretch gap-1">
                        <div className="flex items-start justify-between gap-1">
                          <select
                            value={slot.subject}
                            onChange={(e) => updateSlotSubject(slot.id, e.target.value)}
                            className="input w-full px-1 py-0.5 text-xs font-medium"
                          >
                            {!subjects.includes(slot.subject) && (
                              <option value={slot.subject}>{slot.subject}</option>
                            )}
                            {subjects.map((subj) => (
                              <option key={subj} value={subj}>
                                {subj}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeSlot(slot.id)}
                            className="shrink-0 text-xs leading-none text-[var(--danger)]"
                            title="Remove period"
                          >
                            ✕
                          </button>
                        </div>
                        <select
                          value={slot.teacher_id ?? ''}
                          onChange={(e) => updateSlotTeacher(slot.id, e.target.value)}
                          className="input w-full px-1 py-0.5 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slots.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">No periods added for this section yet.</p>
      )}
      </>
      )}
    </div>
  )
}
