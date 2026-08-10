'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PeriodSwap, Section, Teacher, TimetableSlot } from '@/lib/types'
import { swapFor } from '@/lib/periodSwaps'
import { todayISO, dayNameForDate } from '@/lib/periods'
import TeacherAutocomplete from './TeacherAutocomplete'

function PeriodPicker({
  slots,
  swaps,
  teacherId,
  value,
  onChange,
  sectionMap,
  excludePeriod,
}: {
  slots: TimetableSlot[]
  swaps: PeriodSwap[]
  teacherId: string
  value: number | null
  onChange: (period: number) => void
  sectionMap: Record<number, string>
  excludePeriod?: number | null
}) {
  if (!teacherId) return <p className="text-sm text-[var(--muted)]">Pick a teacher first.</p>
  if (slots.length === 0) return <p className="text-sm text-[var(--muted)]">No periods that day.</p>

  return (
    <div className="flex flex-wrap gap-2">
      {slots.map((slot) => {
        const period = Number(slot.period)
        const alreadySwapped = !!swapFor(swaps, teacherId, period)
        const isExcluded = excludePeriod != null && period === excludePeriod
        const disabled = alreadySwapped || isExcluded
        const selected = value === period
        return (
          <button
            key={slot.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(period)}
            title={alreadySwapped ? 'This period is already part of a swap' : isExcluded ? 'Already picked as the other side of this swap' : undefined}
            className={`rounded-md border px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--bg)]'
            }`}
          >
            <div className="font-semibold">Period {period}</div>
            <div className="text-[var(--muted)]">
              {slot.subject} · Sec {sectionMap[slot.section_id]}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function SwappedPeriodsTab() {
  const [date, setDate] = useState(todayISO())
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})

  const [teacherAId, setTeacherAId] = useState('')
  const [teacherBId, setTeacherBId] = useState('')
  const [periodA, setPeriodA] = useState<number | null>(null)
  const [periodB, setPeriodB] = useState<number | null>(null)
  // Self-swap: trading two of your OWN periods on the same day, e.g. "my
  // 6B period for my own 7A period" — no second teacher involved. Keeps
  // teacherB silently mirrored to teacherA rather than reusing the normal
  // two-teacher form, since the picker and the "who covers this" phrasing
  // both need to read differently for it.
  const [selfSwap, setSelfSwap] = useState(false)

  const [slotsA, setSlotsA] = useState<TimetableSlot[]>([])
  const [slotsB, setSlotsB] = useState<TimetableSlot[]>([])
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [saving, setSaving] = useState(false)

  const dayName = useMemo(() => dayNameForDate(date), [date])

  useEffect(() => {
    async function loadStatic() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teachers').select('*').order('name'),
        supabase.from('sections').select('id, class, section'),
      ])
      setTeachers((t ?? []) as Teacher[])
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
    }
    loadStatic()
  }, [])

  async function loadSwaps() {
    const { data } = await supabase.from('period_swaps').select('*').eq('swap_date', date).order('id')
    setSwaps((data ?? []) as PeriodSwap[])
  }

  useEffect(() => {
    loadSwaps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => {
    if (selfSwap) {
      setTeacherBId(teacherAId)
    } else {
      setTeacherBId('')
    }
    setPeriodA(null)
    setPeriodB(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfSwap])

  useEffect(() => {
    if (selfSwap) setTeacherBId(teacherAId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherAId])

  useEffect(() => {
    setPeriodA(null)
    if (!teacherAId) {
      setSlotsA([])
      return
    }
    supabase
      .from('timetable')
      .select('*')
      .eq('teacher_id', teacherAId)
      .eq('day', dayName)
      .order('period')
      .then(({ data }) => setSlotsA((data ?? []) as TimetableSlot[]))
  }, [teacherAId, dayName])

  useEffect(() => {
    setPeriodB(null)
    if (!teacherBId) {
      setSlotsB([])
      return
    }
    supabase
      .from('timetable')
      .select('*')
      .eq('teacher_id', teacherBId)
      .eq('day', dayName)
      .order('period')
      .then(({ data }) => setSlotsB((data ?? []) as TimetableSlot[]))
  }, [teacherBId, dayName])

  const canConfirm = teacherAId && teacherBId && periodA !== null && periodB !== null

  async function confirmSwap() {
    if (!canConfirm) return
    setSaving(true)
    await supabase.from('period_swaps').insert({
      swap_date: date,
      teacher_a: teacherAId,
      period_a: periodA,
      teacher_b: teacherBId,
      period_b: periodB,
    })
    setSaving(false)
    setTeacherAId('')
    setTeacherBId('')
    setPeriodA(null)
    setPeriodB(null)
    loadSwaps()
  }

  async function removeSwap(id: number) {
    await supabase.from('period_swaps').delete().eq('id', id)
    loadSwaps()
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">New swap</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={selfSwap} onChange={(e) => setSelfSwap(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        Self-swap — trade two of the same teacher&rsquo;s own periods (no second teacher needed)
      </label>

      <div className={`mb-5 grid grid-cols-1 gap-4 card ${selfSwap ? '' : 'md:grid-cols-2'}`}>
        <div>
          <label className="mb-1 block text-sm font-medium">{selfSwap ? 'Teacher' : 'Teacher A'}</label>
          <TeacherAutocomplete teachers={teachers} value={teacherAId} onChange={setTeacherAId} excludeId={selfSwap ? undefined : teacherBId} />
          <div className="mt-3">
            <PeriodPicker
              slots={slotsA}
              swaps={swaps}
              teacherId={teacherAId}
              value={periodA}
              onChange={setPeriodA}
              sectionMap={sectionMap}
              excludePeriod={selfSwap ? periodB : undefined}
            />
          </div>
        </div>
        {selfSwap ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Swap into which of their own periods?</label>
            <PeriodPicker
              slots={slotsB}
              swaps={swaps}
              teacherId={teacherBId}
              value={periodB}
              onChange={setPeriodB}
              sectionMap={sectionMap}
              excludePeriod={periodA}
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium">Teacher B</label>
            <TeacherAutocomplete teachers={teachers} value={teacherBId} onChange={setTeacherBId} excludeId={teacherAId} />
            <div className="mt-3">
              <PeriodPicker
                slots={slotsB}
                swaps={swaps}
                teacherId={teacherBId}
                value={periodB}
                onChange={setPeriodB}
                sectionMap={sectionMap}
              />
            </div>
          </div>
        )}
      </div>

      {periodA !== null && periodB !== null && (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {selfSwap ? (
            <>
              {teacherMap[teacherAId]} now teaches Class {sectionMap[slotsB.find((s) => Number(s.period) === periodB)?.section_id ?? -1]} in
              Period {periodA} (moved from Period {periodB}), and Class{' '}
              {sectionMap[slotsA.find((s) => Number(s.period) === periodA)?.section_id ?? -1]} in Period {periodB} (moved from Period{' '}
              {periodA}).
            </>
          ) : (
            <>
              {teacherMap[teacherAId]} takes Period {periodB} for {teacherMap[teacherBId]}, and {teacherMap[teacherBId]} takes Period{' '}
              {periodA} for {teacherMap[teacherAId]}.
            </>
          )}
        </p>
      )}

      <button
        onClick={confirmSwap}
        disabled={!canConfirm || saving}
        className="btn-primary mb-8"
      >
        Confirm swap
      </button>

      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Swaps on {date}</h2>
      {swaps.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No swaps recorded for this date yet.</p>
      ) : (
        <ul className="space-y-2">
          {swaps.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
            >
              {s.teacher_a === s.teacher_b ? (
                <span className="text-sm">
                  <span className="font-medium">{teacherMap[s.teacher_a] ?? '?'}</span>{' '}
                  <span className="badge-accent mr-1">Self-swap</span>
                  Period {s.period_a} ↔ Period {s.period_b}
                </span>
              ) : (
                <span className="text-sm">
                  <span className="font-medium">{teacherMap[s.teacher_a] ?? '?'}</span> (Period {s.period_a}) ↔{' '}
                  <span className="font-medium">{teacherMap[s.teacher_b] ?? '?'}</span> (Period {s.period_b})
                </span>
              )}
              <button onClick={() => removeSwap(s.id)} className="text-xs text-[var(--danger)] hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
