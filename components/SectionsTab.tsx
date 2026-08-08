'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Section } from '@/lib/types'

export default function SectionsTab() {
  const [sections, setSections] = useState<Section[]>([])
  const [classNum, setClassNum] = useState('')
  const [sectionLetter, setSectionLetter] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('sections').select('*').order('class').order('section')
    setSections((data ?? []) as Section[])
  }

  useEffect(() => {
    load()
  }, [])

  async function addSection(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('sections').insert({
      class: Number(classNum),
      section: sectionLetter.toUpperCase(),
    })
    if (error) {
      setError(error.message)
      return
    }
    setClassNum('')
    setSectionLetter('')
    load()
  }

  async function removeSection(id: number) {
    await supabase.from('sections').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <form
        onSubmit={addSection}
        className="mb-6 flex items-end gap-2 card"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Class</label>
          <input required type="number" value={classNum} onChange={(e) => setClassNum(e.target.value)} className="input w-20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <input
            required
            maxLength={2}
            value={sectionLetter}
            onChange={(e) => setSectionLetter(e.target.value)}
            className="input w-20"
          />
        </div>
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sections.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <span>
              Class {s.class}
              {s.section}
            </span>
            <button onClick={() => removeSection(s.id)} className="text-xs text-[var(--danger)]">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
