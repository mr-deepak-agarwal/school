'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PreferredSub, Section, Teacher } from '@/lib/types'
import TeacherAutocomplete from './TeacherAutocomplete'

export default function PreferredPeriodsTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sections, setSections] = useState<Section[]>([])
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
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
    const { data, error } = await supabase
      .from('preferred_substitutions')
      .select('*')
      .eq('preferred', true)
      .order('id')
    if (error) {
      console.error('Failed to load preferred substitutions', error)
    }
    setPrefs((data ?? []) as PreferredSub[])
    setLoading(false)
  }

  useEffect(() => {
    loadPrefs()
  }, [])

  // A row already exists and is still active (not yet used). If a row
  // exists but has been fulfilled, we let the teacher re-mark it — that
  // just reactivates the same row rather than blocking as a duplicate.
  const existing = prefs.find((p) => p.teacher_id === teacherId && p.section_id === sectionId)
  const alreadyMarked = !!existing && !existing.fulfilled

  async function markPreferred() {
    if (!teacherId || !sectionId || alreadyMarked) return
    setSaving(true)
    const { error } = await supabase
      .from('preferred_substitutions')
      .upsert(
        { teacher_id: teacherId, section_id: sectionId, preferred: true, fulfilled: false },
        { onConflict: 'teacher_id,section_id' }
      )
    setSaving(false)
    if (error) {
      console.error('Failed to save preferred substitution', error)
      alert('Could not save that preference. Please try again.')
      return
    }
    setTeacherId('')
    setSectionId('')
    loadPrefs()
  }

  async function removePreferred(id: number) {
    const { error } = await supabase.from('preferred_substitutions').delete().eq('id', id)
    if (error) {
      console.error('Failed to remove preferred substitution', error)
      alert('Could not remove that preference. Please try again.')
      return
    }
    loadPrefs()
  }

  const pending = prefs.filter((p) => !p.fulfilled)
  const fulfilled = prefs.filter((p) => p.fulfilled)

  return (
    <div>
      <div className="card mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
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
        <div className="flex items-end">
          <button
            onClick={markPreferred}
            disabled={!teacherId || !sectionId || alreadyMarked || saving}
            className="btn-primary w-full sm:w-auto"
          >
            {alreadyMarked ? 'Already marked' : 'Add preference'}
          </button>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Preferred substitutes</h2>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : pending.length === 0 && fulfilled.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No preferred substitutes have been set up yet.</p>
      ) : (
        <>
          {pending.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No active preferences right now.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
                >
                  <span className="text-sm font-medium">
                    {teacherMap[p.teacher_id] ?? 'Unknown teacher'}
                    <span className="ml-2 rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
                      Class {sectionMap[p.section_id] ?? p.section_id}
                    </span>
                  </span>
                  <button onClick={() => removePreferred(p.id)} className="text-xs text-[var(--danger)] hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {fulfilled.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Already used
              </h3>
              <ul className="space-y-2">
                {fulfilled.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 opacity-70"
                  >
                    <span className="text-sm font-medium">
                      {teacherMap[p.teacher_id] ?? 'Unknown teacher'}
                      <span className="ml-2 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
                        Class {sectionMap[p.section_id] ?? p.section_id}
                      </span>
                      <span className="ml-2 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs font-normal text-[var(--success)]">
                        ✓ Done
                      </span>
                    </span>
                    <button onClick={() => removePreferred(p.id)} className="text-xs text-[var(--danger)] hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
