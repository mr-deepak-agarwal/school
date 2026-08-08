'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, Teacher, TimetableSlot } from '@/lib/types'
import { todayISO, dayNameForDate, periodsForHalf } from '@/lib/periods'

// The admin used to land directly inside the Substitutions workflow — a
// data-entry screen, with no "is today okay?" moment first. This tab is
// that moment: a handful of glanceable numbers, then a one-line status per
// absent teacher, before anyone has to open a form. Nothing here is
// editable — it's a status view that hands off to Substitutions for action.
export default function OverviewTab({ onGoToSubstitutions }: { onGoToSubstitutions: () => void }) {
  const [loading, setLoading] = useState(true)
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [leaveToday, setLeaveToday] = useState<LeaveRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [coverage, setCoverage] = useState<Record<string, { needed: number; covered: number }>>({})

  const date = todayISO()
  const dayName = dayNameForDate(date)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const [{ data: teachers }, { data: leave }, { count: pending }, { data: timetable }, { data: subs }] =
        await Promise.all([
          supabase.from('teachers').select('id, name'),
          supabase.from('leave_register').select('*').eq('date', date).eq('status', 'approved').order('id'),
          supabase.from('leave_register').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('date', date),
          supabase.from('timetable').select('id, day, period, teacher_id').eq('day', dayName),
          supabase.from('substitutions').select('id, timetable_id').eq('date', date),
        ])

      if (cancelled) return

      const tMap = Object.fromEntries((teachers ?? []).map((t: Pick<Teacher, 'id' | 'name'>) => [t.id, t.name]))
      const leaveRows = (leave ?? []) as LeaveRequest[]
      const coveredTimetableIds = new Set((subs ?? []).map((s: { timetable_id: number }) => s.timetable_id))

      // For each absent teacher, how many of their periods today actually
      // need a substitute (respecting half-day leave) vs how many already
      // have one recorded.
      const nextCoverage: Record<string, { needed: number; covered: number }> = {}
      for (const l of leaveRows) {
        const half = periodsForHalf(l.half)
        const slots = ((timetable ?? []) as Pick<TimetableSlot, 'id' | 'period' | 'teacher_id'>[]).filter(
          (s) => s.teacher_id === l.teacher_id && half.includes(Number(s.period))
        )
        const covered = slots.filter((s) => coveredTimetableIds.has(s.id)).length
        nextCoverage[l.teacher_id] = { needed: slots.length, covered }
      }

      setTeacherMap(tMap)
      setLeaveToday(leaveRows)
      setPendingCount(pending ?? 0)
      setCoverage(nextCoverage)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [date, dayName])

  const totalNeeded = Object.values(coverage).reduce((sum, c) => sum + c.needed, 0)
  const totalCovered = Object.values(coverage).reduce((sum, c) => sum + c.covered, 0)
  const totalOpen = totalNeeded - totalCovered
  const allClear = !loading && leaveToday.length === 0 && pendingCount === 0

  return (
    <div>
      {/* ---- The one thing that answers "is today okay?" ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Absent today" value={loading ? '—' : leaveToday.length} tone={leaveToday.length > 0 ? 'accent' : 'default'} />
        <StatCard
          label="Periods still open"
          value={loading ? '—' : totalOpen}
          tone={totalOpen > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Periods covered"
          value={loading ? '—' : totalCovered}
          tone="success"
        />
        <StatCard label="Pending requests" value={loading ? '—' : pendingCount} tone={pendingCount > 0 ? 'accent' : 'default'} />
      </div>

      {/* ---- Per-teacher status, one line each — detail lives in Substitutions ---- */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display mb-0 text-lg font-semibold">
            {dayName}, {date}
          </h2>
          <button onClick={onGoToSubstitutions} className="btn-primary btn-sm">
            Mark someone absent
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : allClear ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-[var(--text)]">All clear — no one&rsquo;s on leave today and nothing&rsquo;s waiting on you.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Mark someone absent above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {leaveToday.map((l) => {
              const c = coverage[l.teacher_id] ?? { needed: 0, covered: 0 }
              const open = c.needed - c.covered
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                  <button onClick={onGoToSubstitutions} className="text-left font-medium hover:text-[var(--primary)]">
                    {teacherMap[l.teacher_id] ?? 'Unknown teacher'}
                  </button>
                  {c.needed === 0 ? (
                    <span className="badge-muted">No periods to cover</span>
                  ) : open === 0 ? (
                    <span className="badge-success">All {c.needed} covered</span>
                  ) : (
                    <span className="badge-accent">
                      {open} of {c.needed} still open
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {pendingCount > 0 && (
          <>
            <div className="divider my-3" />
            <button onClick={onGoToSubstitutions} className="text-sm font-medium text-[var(--accent-dark)] hover:underline">
              {pendingCount} leave request{pendingCount === 1 ? '' : 's'} waiting on your decision →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'accent' | 'success' | 'danger'
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-[var(--accent-dark)]'
      : tone === 'success'
      ? 'text-[var(--success)]'
      : tone === 'danger'
      ? 'text-[var(--danger)]'
      : 'text-[var(--text)]'

  return (
    <div className="card">
      <p className="section-label mb-1">{label}</p>
      <p className={`font-display text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
