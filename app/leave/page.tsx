'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import { autoAssignSubstitutionsForLeave } from '@/lib/autoAssignSubstitutions'
import type { LeaveRequest, PreferredSub } from '@/lib/types'

export default function LeavePage() {
  return (
    <AppShell>
      <LeaveContent />
    </AppShell>
  )
}

function LeaveContent() {
  const { teacher } = useCurrentTeacher()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([])
  const [allLeaves, setAllLeaves] = useState<(LeaveRequest & { teacherName?: string })[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState<number | null>(null)
  const [approveNote, setApproveNote] = useState<Record<number, string>>({})
  const [myPreferred, setMyPreferred] = useState<PreferredSub[]>([])
  const [availDate, setAvailDate] = useState('')
  const [markingAvail, setMarkingAvail] = useState(false)

  async function loadLeaves() {
    if (!teacher) return

    const { data: mine } = await supabase
      .from('leave_register')
      .select('*')
      .eq('teacher_id', teacher.id)
      .order('date', { ascending: false })
    setMyLeaves(mine ?? [])

    const { data: myPref } = await supabase
      .from('preferred_substitutions')
      .select('*')
      .eq('teacher_id', teacher.id)
      .eq('preferred', true)
      .order('date', { ascending: true })
    setMyPreferred(myPref ?? [])

    if (teacher.role === 'admin') {
      const { data: all } = await supabase
        .from('leave_register')
        .select('*')
        .order('date', { ascending: false })
      const { data: teachers } = await supabase.from('teachers').select('id, name')
      const nameMap = Object.fromEntries((teachers ?? []).map((t: any) => [t.id, t.name]))
      setAllLeaves((all ?? []).map((l) => ({ ...l, teacherName: nameMap[l.teacher_id] })))
    }
  }

  useEffect(() => {
    loadLeaves()
  }, [teacher])

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault()
    if (!teacher || !date) return
    setSubmitting(true)
    await supabase.from('leave_register').insert({ teacher_id: teacher.id, date, reason })
    setDate('')
    setReason('')
    setSubmitting(false)
    loadLeaves()
  }

  async function markAvailable(e: React.FormEvent) {
    e.preventDefault()
    if (!teacher || !availDate) return
    setMarkingAvail(true)

    const { data: existing } = await supabase
      .from('preferred_substitutions')
      .select('id')
      .eq('teacher_id', teacher.id)
      .eq('date', availDate)
      .maybeSingle()

    if (existing) {
      await supabase.from('preferred_substitutions').update({ preferred: true }).eq('id', existing.id)
    } else {
      await supabase.from('preferred_substitutions').insert({ teacher_id: teacher.id, date: availDate, preferred: true })
    }

    setAvailDate('')
    setMarkingAvail(false)
    loadLeaves()
  }

  async function removeAvailability(id: number) {
    await supabase.from('preferred_substitutions').delete().eq('id', id)
    loadLeaves()
  }

  async function approve(l: LeaveRequest) {
    setApproving(l.id)
    await supabase.from('leave_register').update({ status: 'approved' }).eq('id', l.id)

    const { assigned, unassigned } = await autoAssignSubstitutionsForLeave(l.teacher_id, l.date)

    let note = ''
    if (assigned.length === 0 && unassigned.length === 0) {
      note = 'No periods to cover that day.'
    } else {
      const parts = []
      if (assigned.length > 0) parts.push(`${assigned.length} substitution${assigned.length > 1 ? 's' : ''} auto-assigned`)
      if (unassigned.length > 0)
        parts.push(`${unassigned.length} need${unassigned.length > 1 ? '' : 's'} manual assignment`)
      note = parts.join(', ') + '.'
    }
    setApproveNote((m) => ({ ...m, [l.id]: note }))

    setApproving(null)
    loadLeaves()
  }

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Leave</h1>

      <form onSubmit={submitLeave} className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="mb-1 block text-sm font-medium">Date</label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-3 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-3 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Request leave
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">My requests</h2>
      <ul className="mb-8 space-y-2">
        {myLeaves.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <span>
              {l.date}
              {l.reason ? ` — ${l.reason}` : ''}
            </span>
            <span className={l.status === 'approved' ? 'text-[var(--success)]' : 'text-[var(--muted)]'}>
              {l.status}
            </span>
          </li>
        ))}
        {myLeaves.length === 0 && <p className="text-sm text-[var(--muted)]">No leave requested yet.</p>}
      </ul>

      <h2 className="mb-1 text-sm font-semibold text-[var(--muted)]">Substitute availability</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Mark dates you&rsquo;re free to cover classes. If a colleague teaching your subject goes on leave, you&rsquo;ll
        be matched first.
      </p>
      <form onSubmit={markAvailable} className="mb-4 flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input
            type="date"
            required
            value={availDate}
            onChange={(e) => setAvailDate(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={markingAvail}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Mark available
        </button>
      </form>
      <ul className="mb-8 space-y-2">
        {myPreferred.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <span>{p.date}</span>
            <button onClick={() => removeAvailability(p.id)} className="text-xs font-medium text-[var(--danger)]">
              Remove
            </button>
          </li>
        ))}
        {myPreferred.length === 0 && <p className="text-sm text-[var(--muted)]">No availability marked yet.</p>}
      </ul>

      {teacher?.role === 'admin' && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">All requests</h2>
          <ul className="space-y-2">
            {allLeaves.map((l) => (
              <li key={l.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    {l.teacherName} — {l.date}
                    {l.reason ? ` — ${l.reason}` : ''}
                  </span>
                  {l.status === 'pending' ? (
                    <button
                      onClick={() => approve(l)}
                      disabled={approving === l.id}
                      className="font-medium text-[var(--primary)] disabled:opacity-60"
                    >
                      {approving === l.id ? 'Approving…' : 'Approve'}
                    </button>
                  ) : (
                    <span className="text-[var(--success)]">approved</span>
                  )}
                </div>
                {approveNote[l.id] && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {approveNote[l.id]}{' '}
                    <a href="/substitutions" className="font-medium text-[var(--primary)]">
                      Review on Substitutions →
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
