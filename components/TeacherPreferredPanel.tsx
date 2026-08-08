'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PreferredSub, Section, Teacher } from '@/lib/types'

// Lets a teacher mark which classes they're happy to substitute for,
// instead of the admin having to set this up on their behalf from the
// Preferred Periods tab. Writes to the same preferred_substitutions
// table, just always scoped to the signed-in teacher's own id.
export default function TeacherPreferredPanel({ teacher }: { teacher: Teacher }) {
  const [sections, setSections] = useState<Section[]>([])
  const [prefs, setPrefs] = useState<PreferredSub[]>([])
  const [loading, setLoading] = useState(true)
  const [busySectionId, setBusySectionId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('sections').select('*').order('class').order('section'),
      supabase.from('preferred_substitutions').select('*').eq('teacher_id', teacher.id).eq('preferred', true).order('id'),
    ])
    setSections((s ?? []) as Section[])
    setPrefs((p ?? []) as PreferredSub[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id])

  const activeSectionIds = new Set(prefs.filter((p) => !p.fulfilled).map((p) => p.section_id))

  async function toggle(sectionId: number) {
    setBusySectionId(sectionId)
    const existing = prefs.find((p) => p.section_id === sectionId)

    if (existing && !existing.fulfilled) {
      // Already preferred — turning it off just removes the row.
      await supabase.from('preferred_substitutions').delete().eq('id', existing.id)
    } else {
      await supabase
        .from('preferred_substitutions')
        .upsert(
          { teacher_id: teacher.id, section_id: sectionId, preferred: true, fulfilled: false },
          { onConflict: 'teacher_id,section_id' }
        )
    }
    setBusySectionId(null)
    load()
  }

  return (
    <div>
      <div className="card mb-5">
        <h2 className="section-label mb-1">Preferred classes to substitute</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Tap a class to mark yourself as a preferred substitute for it — the admin sees this first when a period in
          that class needs covering.
        </p>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const active = activeSectionIds.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  disabled={busySectionId === s.id}
                  className={`chip ${active ? 'chip-active' : ''}`}
                >
                  Class {s.class}
                  {s.section}
                  {active && <span className="ml-1">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Already used</h2>
      {prefs.filter((p) => p.fulfilled).length === 0 ? (
        <p className="text-sm text-[var(--muted)]">None of your preferences have been used yet.</p>
      ) : (
        <ul className="space-y-2">
          {prefs
            .filter((p) => p.fulfilled)
            .map((p) => {
              const section = sections.find((s) => s.id === p.section_id)
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 opacity-70"
                >
                  <span className="text-sm font-medium">
                    {section ? `Class ${section.class}${section.section}` : 'Unknown class'}
                    <span className="ml-2 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs font-normal text-[var(--success)]">
                      ✓ Done
                    </span>
                  </span>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
