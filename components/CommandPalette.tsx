'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type CommandAction = {
  id: string
  label: string
  hint?: string
  onRun: () => void
}

// A Cmd/Ctrl+K quick-action palette. For an admin or teacher opening this
// app every day, jumping straight to "Mark someone absent" or the
// Timetable tab by typing a few letters is faster than reaching for the
// mouse — the pattern Linear, Vercel, and Raycast all lead with. Actions
// are passed in by the page, so the same palette works for the admin's
// tab set and the teacher's lighter one.
export default function CommandPalette({ actions }: { actions: CommandAction[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isCmdK) {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      // Wait a tick for the overlay to mount before focusing.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.hint?.toLowerCase().includes(q))
  }, [actions, query])

  function run(action: CommandAction) {
    setOpen(false)
    action.onRun()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost btn-sm hidden items-center gap-1.5 text-[var(--muted)] sm:inline-flex"
        title="Quick actions"
      >
        <span>Quick actions</span>
        <kbd className="rounded border border-[var(--border)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-semibold">
          ⌘K
        </kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--ink)]/40 px-4 pt-24" onClick={() => setOpen(false)}>
      <div
        className="card w-full max-w-md animate-fade-in !p-0 shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlighted((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlighted((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && filtered[highlighted]) {
              run(filtered[highlighted])
            }
          }}
          placeholder="Jump to a tab or action…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm font-medium outline-none placeholder:text-[var(--muted)]"
        />
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">No matches.</p>
          ) : (
            filtered.map((a, i) => (
              <button
                key={a.id}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => run(a)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  i === highlighted ? 'bg-[var(--primary)] text-white' : 'text-[var(--text)]'
                }`}
              >
                <span>{a.label}</span>
                {a.hint && (
                  <span className={`text-xs font-normal ${i === highlighted ? 'text-white/70' : 'text-[var(--muted)]'}`}>
                    {a.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
