'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { LeaveRequest, Teacher } from '@/lib/types'
import { todayISO, halfLabel, type LeaveHalf } from '@/lib/periods'

// Teachers file their own leave here — every submission lands as
// status: 'pending' and only actually removes them from their timetable
// once the admin approves it from the Substitutions tab (see the
// "Pending leave requests" card there). This keeps a teacher's own typo
// or last-minute change of mind from silently triggering a substitution
// hunt before anyone's looked at it.
export default function TeacherLeavePanel({ teacher }: { teacher: Teacher }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [date, setDate] = useState(todayISO())
  const [half, setHalf] = useState<LeaveHalf>('full')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('leave_register')
      .select('*')
      .eq('teacher_id', teacher.id)
      .order('date', { ascending: false })
      .limit(20)
    setRequests((data ?? []) as LeaveRequest[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id])

  async function submit() {
    if (!date) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('leave_register')
      .upsert(
        { date, teacher_id: teacher.id, half, reason: reason.trim() || null, status: 'pending' },
        { onConflict: 'date,teacher_id' }
      )
    setSaving(false)
    if (err) {
      console.error('Failed to submit leave request', err)
      setError('Could not submit that request. Please try again.')
      return
    }
    setReason('')
    setHalf('full')
    load()
  }

  async function cancel(id: number) {
    await supabase.from('leave_register').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="card mb-5">
        <h2 className="section-label mb-3">Request leave</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Duration</label>
            <select value={half} onChange={(e) => setHalf(e.target.value as LeaveHalf)} className="input w-full">
              <option value="full">Full day</option>
              <option value="first">Half day (AM)</option>
              <option value="second">Half day (PM)</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family function"
              className="input w-full"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        <button onClick={submit} disabled={!date || saving} className="btn-primary mt-3">
          {saving ? 'Submitting…' : 'Submit request'}
        </button>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Submitting again for the same date replaces your earlier request for that day and re-sends it for approval.
        </p>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Your leave history</h2>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No leave requests yet.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
            >
              <div>
                <span className="text-sm font-medium">{r.date}</span>
                <span className="ml-2 rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
                  {halfLabel(r.half)}
                </span>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${
                    r.status === 'approved' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--warn)]/10 text-[var(--warn)]'
                  }`}
                >
                  {r.status === 'approved' ? '✓ Approved' : 'Pending'}
                </span>
                {r.reason && <p className="mt-1 text-xs text-[var(--muted)]">{r.reason}</p>}
              </div>
              {r.status === 'pending' && (
                <button onClick={() => cancel(r.id)} className="text-xs text-[var(--danger)] hover:underline">
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
