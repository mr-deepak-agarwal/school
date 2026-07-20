'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import type { LeaveRequest } from '@/lib/types'

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

  async function loadLeaves() {
    if (!teacher) return

    const { data: mine } = await supabase
      .from('leave_register')
      .select('*')
      .eq('teacher_id', teacher.id)
      .order('date', { ascending: false })
    setMyLeaves(mine ?? [])

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

  async function approve(id: number) {
    await supabase.from('leave_register').update({ status: 'approved' }).eq('id', id)
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

      {teacher?.role === 'admin' && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">All requests</h2>
          <ul className="space-y-2">
            {allLeaves.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <span>
                  {l.teacherName} — {l.date}
                  {l.reason ? ` — ${l.reason}` : ''}
                </span>
                {l.status === 'pending' ? (
                  <button onClick={() => approve(l.id)} className="font-medium text-[var(--primary)]">
                    Approve
                  </button>
                ) : (
                  <span className="text-[var(--success)]">approved</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
