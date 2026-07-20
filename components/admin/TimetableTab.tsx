'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Section, Teacher, TimetableSlot } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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
    if (!sectionId || !form.period || !form.subject || !form.teacher_id) return

    const { error } = await supabase.from('timetable').insert({
      day: form.day,
      period: Number(form.period),
      subject: form.subject,
      teacher_id: form.teacher_id,
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
        className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-3"
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
          <label className="mb-1 block text-sm font-medium">Teacher</label>
          <select
            required
            value={form.teacher_id}
            onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
            className="input"
          >
            <option value="">Select…</option>
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
          <button type="submit" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
            Add period
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {DAYS.map((day) => {
          const daySlots = slots.filter((s) => s.day === day)
          if (daySlots.length === 0) return null
          return (
            <li key={day}>
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">{day}</p>
              <ul className="mb-3 space-y-2">
                {daySlots.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
                  >
                    <span>
                      Period {s.period} · {s.subject} · {teachers.find((t) => t.id === s.teacher_id)?.name ?? 'Unassigned'}
                    </span>
                    <button onClick={() => removeSlot(s.id)} className="text-xs text-[var(--danger)]">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
        {slots.length === 0 && <p className="text-sm text-[var(--muted)]">No periods added for this section yet.</p>}
      </ul>
    </div>
  )
}
