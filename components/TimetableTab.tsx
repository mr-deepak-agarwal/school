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
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [form, setForm] = useState({
    day: 'Monday',
    period: '',
    subject: '',
    teacher_id: '',
    start_time: '',
    end_time: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('sections').select('*').order('class').order('section'),
        supabase.from('teachers').select('*').order('name'),
      ])
      setSections((s ?? []) as Section[])
      setTeachers((t ?? []) as Teacher[])
      if (s && s.length > 0) setSectionId(s[0].id)
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

    const { error } = await supabase.from('timetable').insert({
      day: form.day,
      period: Number(form.period),
      subject: form.subject,
      teacher_id: form.teacher_id || null,
      section_id: sectionId,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
    })

    if (error) {
      setError(error.message)
      return
    }

    setForm({ day: form.day, period: '', subject: '', teacher_id: '', start_time: '', end_time: '' })
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

  return (
    <div>
      <div className="mb-4">
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
          <input
            required
            type="number"
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <input
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="input"
          />
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
        <div>
          <label className="mb-1 block text-sm font-medium">Start time</label>
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">End time</label>
          <input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            className="input"
          />
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
                          <span className="truncate text-sm font-medium leading-tight" title={slot.subject}>
                            {slot.subject}
                          </span>
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
    </div>
  )
}
