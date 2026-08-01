'use client'

import { useEffect, useRef, useState } from 'react'
import type { Teacher } from '@/lib/types'

export default function TeacherAutocomplete({
  teachers,
  value,
  onChange,
  placeholder,
  excludeId,
}: {
  teachers: Teacher[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  // Optionally hide one teacher from the results (e.g. teacher A when picking teacher B for a swap)
  excludeId?: string
}) {
  const selected = teachers.find((t) => t.id === value)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Keep the visible text in sync if the selected id changes from outside
  // (e.g. cleared by a parent, or set programmatically).
  useEffect(() => {
    setQuery(selected?.name ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const pool = excludeId ? teachers.filter((t) => t.id !== excludeId) : teachers
  const q = query.trim().toLowerCase()
  const matches = (q ? pool.filter((t) => t.name.toLowerCase().includes(q)) : pool).slice(0, 8)

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'Type a teacher name…'}
        className="input"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-md">
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(t.id)
                  setQuery(t.name)
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg)]"
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)] shadow-md">
          No teacher matches &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
