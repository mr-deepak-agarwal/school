'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PreferredSub, Section, Teacher } from '@/lib/types'
import { todayISO } from '@/lib/periods'
import TeacherAutocomplete from './TeacherAutocomplete'

export default function PreferredPeriodsTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sections, setSections] = useState<Section[]>([])
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [date, setDate] = useState(todayISO())
  const [teacherId, setTeacherId] = useState('')
  const [sectionId, setSectionId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<PreferredSub[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadStatic() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teachers').select('*').order('name'),
        supabase.from('sections').select('*').order('class').order('section'),
      ])
      setTeachers((t ?? []) as Teacher[])
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
      setSections((s ?? []) as Section[])
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
    }
    loadStatic()
  }, [])

  async function loadPrefs() {
    setLoading(true)
    const { data } = await supabase
      .from('preferred_substitutions')
      .select('*')
      .eq('date', date)
      .eq('preferred', true)
      .order('id')
    setPrefs((data ?? []) as PreferredSub[])
    setLoading(false)
  }

  useEffect(() => {
    loadPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const alreadyMarked = prefs.some((p) => p.teacher_id === teacherId && p.section_id === sectionId)

  async function markPreferred() {
    if (!teacherId || !sectionId || alreadyMarked) return
    setSaving(true)
    await supabase
      .from('preferred_substitutions')
      .upsert(
        { date, teacher_id: teacherId, section_id: sectionId, preferred: true },
        { onConflict: 'date,teacher_id,section_id' }
      )
    setSaving(false)
    setTeacherId('')
    setSectionId('')
    loadPrefs()
  }

  async function removePreferred(id: number) {
    await supabase.from('preferred_substitutions').delete().eq('id', id)
    loadPrefs()
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <div>
          <label className="mb-1 block text-sm font-medium">Teacher</label>
          <TeacherAutocomplete teachers={teachers} value={teacherId} onChange={setTeacherId} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : '')}
            className="input"
          >
            <option value="">Which grade/section?</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Class {s.class}
                {s.section}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
        <div className="flex items-end">
          <button
            onClick={markPreferred}
            disabled={!teacherId || !sectionId || alreadyMarked || saving}
            className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
          >
            {alreadyMarked ? 'Already marked' : 'Mark as preferred'}
          </button>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Preferred substitutes for {date}</h2>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : prefs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No one has been marked as a preferred substitute for this date yet.</p>
      ) : (
        <ul className="space-y-2">
          {prefs.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
            >
              <span className="text-sm font-medium">
                {teacherMap[p.teacher_id] ?? 'Unknown teacher'}
                {p.section_id != null && (
                  <span className="ml-2 rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
                    Class {sectionMap[p.section_id] ?? p.section_id}
                  </span>
                )}
              </span>
              <button onClick={() => removePreferred(p.id)} className="text-xs text-[var(--danger)] hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
