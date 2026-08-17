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

// A swap where you pick a class+section and two periods, rather than two
// teachers directly. Under the hood it resolves to the exact same
// {teacher_a, period_a, teacher_b, period_b} record — whoever teaches
// period A for that section becomes teacher_a, whoever teaches period B
// becomes teacher_b. If it's the same teacher both periods, that's just a
// self-swap by another name and behaves identically once saved.
function SectionPeriodPicker({
  slots,
  swaps,
  teacherMap,
  value,
  onChange,
  excludePeriod,
}: {
  slots: TimetableSlot[]
  swaps: PeriodSwap[]
  teacherMap: Record<string, string>
  value: number | null
  onChange: (period: number) => void
  excludePeriod?: number | null
}) {
  if (slots.length === 0) return <p className="text-sm text-[var(--muted)]">No periods that day for this section.</p>

  return (
    <div className="flex flex-wrap gap-2">
      {slots.map((slot) => {
        const period = Number(slot.period)
        const unassigned = !slot.teacher_id
        const alreadySwapped = !!slot.teacher_id && !!swapFor(swaps, slot.teacher_id, period)
        const isExcluded = excludePeriod != null && period === excludePeriod
        const disabled = unassigned || alreadySwapped || isExcluded
        const selected = value === period
        return (
          <button
            key={slot.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(period)}
            title={
              unassigned
                ? 'No teacher assigned to this period'
                : alreadySwapped
                ? 'This period is already part of a swap'
                : isExcluded
                ? 'Already picked as the other side of this swap'
                : undefined
            }
            className={`rounded-md border px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--bg)]'
            }`}
          >
            <div className="font-semibold">Period {period}</div>
            <div className="text-[var(--muted)]">
              {slot.subject} · {slot.teacher_id ? teacherMap[slot.teacher_id] ?? '?' : 'Unassigned'}
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
  const [sections, setSections] = useState<Section[]>([])

  const [teacherAId, setTeacherAId] = useState('')
  const [teacherBId, setTeacherBId] = useState('')
  const [periodA, setPeriodA] = useState<number | null>(null)
  const [periodB, setPeriodB] = useState<number | null>(null)
  // Three ways to build a swap:
  //  - 'teachers': pick two different teachers, then a period from each
  //  - 'self': one teacher trading two of their own periods
  //  - 'section': pick a class+section and two of ITS periods — the
  //    teachers on either side are resolved automatically. This is the
  //    "period 7 swapped with period 3 for this class" case, where the
  //    admin thinks in terms of the section's schedule, not who teaches it.
  const [swapMode, setSwapMode] = useState<'teachers' | 'self' | 'section'>('teachers')
  const selfSwap = swapMode === 'self'

  // Section-mode state
  const [classFilter, setClassFilter] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [sectionSlots, setSectionSlots] = useState<TimetableSlot[]>([])

  const [slotsA, setSlotsA] = useState<TimetableSlot[]>([])
  const [slotsB, setSlotsB] = useState<TimetableSlot[]>([])
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [saving, setSaving] = useState(false)

  const dayName = useMemo(() => dayNameForDate(date), [date])

  useEffect(() => {
    async function loadStatic() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teachers').select('*').order('name'),
        supabase.from('sections').select('id, class, section').order('class').order('section'),
      ])
      setTeachers((t ?? []) as Teacher[])
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
      setSections((s ?? []) as Section[])
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
    }
    loadStatic()
  }, [])

  const classOptions = useMemo(() => Array.from(new Set(sections.map((s) => s.class))).sort((a, b) => a - b), [sections])
  const sectionOptions = useMemo(
    () => sections.filter((s) => !classFilter || s.class === Number(classFilter)),
    [sections, classFilter]
  )

  async function loadSwaps() {
    const { data } = await supabase.from('period_swaps').select('*').eq('swap_date', date).order('id')
    setSwaps((data ?? []) as PeriodSwap[])
  }

  useEffect(() => {
    loadSwaps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => {
    setTeacherAId('')
    setTeacherBId('')
    setPeriodA(null)
    setPeriodB(null)
    setClassFilter('')
    setSectionId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapMode])

  useEffect(() => {
    if (selfSwap) setTeacherBId(teacherAId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherAId])

  // Section mode: fetch this section's full day schedule so both period
  // pickers can pull from the same list. Each row already carries its own
  // teacher_id, which is what actually gets saved on confirm.
  useEffect(() => {
    setPeriodA(null)
    setPeriodB(null)
    if (swapMode !== 'section' || !sectionId) {
      setSectionSlots([])
      return
    }
    supabase
      .from('timetable')
      .select('*')
      .eq('section_id', Number(sectionId))
      .eq('day', dayName)
      .order('period')
      .then(({ data }) => setSectionSlots((data ?? []) as TimetableSlot[]))
  }, [swapMode, sectionId, dayName])

  // Once both periods are picked in section mode, resolve which teacher
  // actually owns each one — that's what a normal period_swaps row needs.
  useEffect(() => {
    if (swapMode !== 'section') return
    const rowA = sectionSlots.find((s) => Number(s.period) === periodA)
    const rowB = sectionSlots.find((s) => Number(s.period) === periodB)
    setTeacherAId(rowA?.teacher_id ?? '')
    setTeacherBId(rowB?.teacher_id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapMode, periodA, periodB, sectionSlots])

  useEffect(() => {
    // In section mode, teacherAId is derived FROM the chosen period (see
    // the resolve effect above) — resetting periodA here would immediately
    // undo the selection the user just made. slotsA is unused in section
    // mode anyway (SectionPeriodPicker reads from sectionSlots instead).
    if (swapMode === 'section') return
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
  }, [teacherAId, dayName, swapMode])

  useEffect(() => {
    if (swapMode === 'section') return
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
  }, [teacherBId, dayName, swapMode])

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
    setClassFilter('')
    setSectionId('')
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

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { value: 'teachers', label: 'Two teachers' },
            { value: 'self', label: "Same teacher's own periods" },
            { value: 'section', label: 'Same class — two periods' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSwapMode(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              swapMode === opt.value
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-dark)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--bg)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {swapMode === 'section' ? (
        <div className="mb-5 grid grid-cols-1 gap-4 card md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Class</label>
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value)
                setSectionId('')
              }}
              className="input"
            >
              <option value="">Choose a class</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
            <label className="mb-1 mt-3 block text-sm font-medium">Section</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input" disabled={!classFilter}>
              <option value="">Choose a section</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.class}
                  {s.section}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Which two periods swap?</label>
            {!sectionId ? (
              <p className="text-sm text-[var(--muted)]">Pick a class &amp; section first.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-[var(--muted)]">First period</div>
                  <SectionPeriodPicker
                    slots={sectionSlots}
                    swaps={swaps}
                    teacherMap={teacherMap}
                    value={periodA}
                    onChange={setPeriodA}
                    excludePeriod={periodB}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-[var(--muted)]">Swaps with</div>
                  <SectionPeriodPicker
                    slots={sectionSlots}
                    swaps={swaps}
                    teacherMap={teacherMap}
                    value={periodB}
                    onChange={setPeriodB}
                    excludePeriod={periodA}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
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
      )}

      {periodA !== null && periodB !== null && (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {swapMode === 'section' ? (
            <>
              Class {sectionMap[Number(sectionId)] ?? sectionId}: Period {periodA} (
              {sectionSlots.find((s) => Number(s.period) === periodA)?.subject}, {teacherMap[teacherAId] ?? 'Unassigned'}) swaps with Period{' '}
              {periodB} ({sectionSlots.find((s) => Number(s.period) === periodB)?.subject}, {teacherMap[teacherBId] ?? 'Unassigned'}).
            </>
          ) : selfSwap ? (
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
