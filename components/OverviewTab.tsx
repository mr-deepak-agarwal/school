'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, Section, Substitution, Teacher, TimetableSlot } from '@/lib/types'
import { todayISO, dayNameForDate, periodsForHalf } from '@/lib/periods'

// The admin used to land directly inside the Substitutions workflow — a
// data-entry screen, with no "is today okay?" moment first. This tab is
// that moment: a handful of glanceable numbers, then a one-line status per
// absent teacher, before anyone has to open a form. Nothing here is
// editable — it's a status view that hands off to Substitutions for action.
export default function OverviewTab({ onGoToSubstitutions }: { onGoToSubstitutions: () => void }) {
  const [loading, setLoading] = useState(true)
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [leaveToday, setLeaveToday] = useState<LeaveRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [coverage, setCoverage] = useState<Record<string, { needed: number; covered: number }>>({})
  const [dayTimetable, setDayTimetable] = useState<TimetableSlot[]>([])
  const [subsToday, setSubsToday] = useState<Substitution[]>([])
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')

  const date = todayISO()
  const dayName = dayNameForDate(date)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const [{ data: teachers }, { data: sections }, { data: leave }, { count: pending }, { data: timetable }, { data: subs }] =
        await Promise.all([
          supabase.from('teachers').select('id, name'),
          supabase.from('sections').select('id, class, section'),
          supabase.from('leave_register').select('*').eq('date', date).eq('status', 'approved').order('id'),
          supabase.from('leave_register').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('date', date),
          supabase.from('timetable').select('id, day, period, section_id, subject, teacher_id').eq('day', dayName),
          supabase.from('substitutions').select('*').eq('date', date),
        ])

      if (cancelled) return

      const tMap = Object.fromEntries((teachers ?? []).map((t: Pick<Teacher, 'id' | 'name'>) => [t.id, t.name]))
      const sMap = Object.fromEntries(
        ((sections ?? []) as Pick<Section, 'id' | 'class' | 'section'>[]).map((s) => [s.id, `${s.class}${s.section}`])
      )
      const leaveRows = (leave ?? []) as LeaveRequest[]
      const subRows = (subs ?? []) as Substitution[]
      const coveredTimetableIds = new Set(subRows.map((s) => s.timetable_id))

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
      setSectionMap(sMap)
      setLeaveToday(leaveRows)
      setPendingCount(pending ?? 0)
      setCoverage(nextCoverage)
      setDayTimetable((timetable ?? []) as TimetableSlot[])
      setSubsToday(subRows)
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

  // Plain-text summary for sharing (WhatsApp/SMS/etc via the Web Share API,
  // or clipboard as a fallback) — built from the same data already loaded
  // for the page, so nothing extra is fetched when the button is pressed.
  const shareText = useMemo(() => {
    const lines = [`Substitutions — ${dayName}, ${date}`, '']

    if (leaveToday.length === 0) {
      lines.push('No one is on leave today.')
    } else {
      for (const l of leaveToday) {
        const half = periodsForHalf(l.half)
        const slots = dayTimetable
          .filter((s) => s.teacher_id === l.teacher_id && half.includes(Number(s.period)))
          .sort((a, b) => Number(a.period) - Number(b.period))

        lines.push(`${teacherMap[l.teacher_id] ?? 'Unknown teacher'} — absent${l.half !== 'full' ? ` (${l.half})` : ''}`)

        if (slots.length === 0) {
          lines.push('  No periods to cover')
        } else {
          for (const slot of slots) {
            const sub = subsToday.find((s) => s.timetable_id === slot.id)
            const section = sectionMap[slot.section_id] ?? '—'
            if (sub) {
              const subName = teacherMap[sub.substitute_teacher_id] ?? 'someone'
              lines.push(`  P${slot.period} ${slot.subject} (${section}) → ${subName}`)
            } else {
              lines.push(`  P${slot.period} ${slot.subject} (${section}) → not yet assigned`)
            }
          }
        }
        lines.push('')
      }
    }

    lines.push(`${totalCovered}/${totalNeeded} periods covered${totalOpen > 0 ? `, ${totalOpen} still open` : ''}.`)
    return lines.join('\n')
  }, [dayName, date, leaveToday, dayTimetable, subsToday, teacherMap, sectionMap, totalCovered, totalNeeded, totalOpen])

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Substitutions — ${dayName}, ${date}`, text: shareText })
      } catch {
        // User cancelled the share sheet — nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch {
      // Clipboard blocked (permissions, non-HTTPS, etc.) — nothing more we can do silently.
    }
  }

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
          <div className="flex items-center gap-2">
            <button onClick={handleShare} disabled={loading} className="btn-secondary btn-sm">
              {shareState === 'copied' ? 'Copied!' : 'Share'}
            </button>
            <button onClick={onGoToSubstitutions} className="btn-primary btn-sm">
              Mark someone absent
            </button>
          </div>
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
