'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PeriodSwap, Substitution, Teacher, TimetableSlot } from '@/lib/types'
import { swapFor, swapPartner } from '@/lib/periodSwaps'
import { todayISO, dayNameForDate, PERIODS } from '@/lib/periods'

type ExtraCover = {
  id: number
  timetable_id: number
  period: number
  section_id: number
  subject: string
  original_teacher_id: string
}

export default function TeacherHome({ teacher }: { teacher: Teacher }) {
  const [date, setDate] = useState(todayISO())
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})

  const [mySlots, setMySlots] = useState<TimetableSlot[]>([])
  const [mySubs, setMySubs] = useState<Substitution[]>([]) // where MY period was covered by someone else
  const [extraCovers, setExtraCovers] = useState<ExtraCover[]>([]) // where I'm covering someone else's period
  const [swaps, setSwaps] = useState<PeriodSwap[]>([])
  const [loading, setLoading] = useState(true)

  const dayName = useMemo(() => dayNameForDate(date), [date])

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('sections').select('id, class, section'),
        supabase.from('teachers').select('id, name'),
      ])
      setSectionMap(Object.fromEntries((s ?? []).map((x: any) => [x.id, `${x.class}${x.section}`])))
      setTeacherMap(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.name])))
    }
    loadStatic()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: slots }, { data: dayTimetable }, { data: subsToday }, { data: swapRows }] = await Promise.all([
        supabase.from('timetable').select('*').eq('teacher_id', teacher.id).eq('day', dayName).order('period'),
        supabase.from('timetable').select('id, period, section_id, subject, teacher_id').eq('day', dayName),
        supabase.from('substitutions').select('*').eq('date', date),
        supabase.from('period_swaps').select('*').eq('swap_date', date),
      ])

      setMySlots((slots ?? []) as TimetableSlot[])
      setSwaps((swapRows ?? []) as PeriodSwap[])

      const allSubs = (subsToday ?? []) as Substitution[]
      setMySubs(allSubs.filter((s) => (slots ?? []).some((sl: any) => sl.id === s.timetable_id)))

      const rowById = Object.fromEntries(((dayTimetable ?? []) as any[]).map((r) => [r.id, r]))
      const mine = allSubs
        .filter((s) => s.substitute_teacher_id === teacher.id)
        .map((s) => {
          const row = rowById[s.timetable_id]
          if (!row) return null
          return {
            id: s.id,
            timetable_id: s.timetable_id,
            period: Number(row.period),
            section_id: row.section_id,
            subject: row.subject,
            original_teacher_id: s.original_teacher_id,
          } as ExtraCover
        })
        .filter((x): x is ExtraCover => x !== null)
      setExtraCovers(mine)

      setLoading(false)
    }
    load()
  }, [teacher.id, date, dayName])

  // Own periods merged with any extra periods picked up as a substitute,
  // sorted into one timeline so the day reads top-to-bottom in order.
  const timeline = useMemo(() => {
    type Row =
      | { kind: 'own'; period: number; slot: TimetableSlot }
      | { kind: 'extra'; period: number; cover: ExtraCover }
    const rows: Row[] = [
      ...mySlots.map((slot): Row => ({ kind: 'own', period: Number(slot.period), slot })),
      ...extraCovers.map((cover): Row => ({ kind: 'extra', period: cover.period, cover })),
    ]
    return rows.sort((a, b) => a.period - b.period)
  }, [mySlots, extraCovers])

  return (
    <div>
      <div className="card mb-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-label mb-0">Your day</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input inline-block w-auto" />
        </div>
        <p className="text-sm text-[var(--muted)]">
          {dayName}, {date}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : timeline.length === 0 ? (
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Nothing on your timetable for {dayName}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {timeline.map((row) => {
            const periodInfo = PERIODS.find((p) => p.period === row.period)

            if (row.kind === 'extra') {
              return (
                <div key={`extra-${row.cover.id}`} className="card">
                  <PeriodHeader period={row.period} time={periodInfo} badge={<span className="badge-accent shrink-0">Covering</span>} />
                  <p className="mt-2 text-sm font-semibold leading-snug">{row.cover.subject}</p>
                  <p className="text-xs text-[var(--muted)]">Class {sectionMap[row.cover.section_id]}</p>
                  <div className="divider my-3" />
                  <p className="text-sm text-[var(--muted)]">
                    Filling in for <span className="font-medium text-[var(--text)]">{teacherMap[row.cover.original_teacher_id] ?? 'a teacher'}</span>
                  </p>
                </div>
              )
            }

            const slot = row.slot
            const swap = swapFor(swaps, teacher.id, row.period)
            const covered = mySubs.find((s) => s.timetable_id === slot.id)

            return (
              <div key={slot.id} className="card">
                <PeriodHeader
                  period={row.period}
                  time={periodInfo}
                  badge={
                    swap ? (
                      <span className="badge-success shrink-0">Swapped</span>
                    ) : covered ? (
                      <span className="badge-warn shrink-0">Covered for you</span>
                    ) : undefined
                  }
                />
                <p className="mt-2 text-sm font-semibold leading-snug">{slot.subject}</p>
                <p className="text-xs text-[var(--muted)]">Class {sectionMap[slot.section_id]}</p>

                {(swap || covered) && (
                  <>
                    <div className="divider my-3" />
                    {swap ? (
                      <p className="text-sm text-[var(--success)]">
                        {teacherMap[swapPartner(swap, teacher.id).partnerId] ?? 'Another teacher'} is covering this
                        <span className="block text-xs font-normal text-[var(--muted)]">
                          (you take their Period {swapPartner(swap, teacher.id).partnerPeriod} in return)
                        </span>
                      </p>
                    ) : covered ? (
                      <p className="text-sm text-[var(--warn)]">
                        {teacherMap[covered.substitute_teacher_id] ?? 'Another teacher'} is covering this — you&rsquo;re marked absent this period.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PeriodHeader({
  period,
  time,
  badge,
}: {
  period: number
  time?: { start: string; end: string }
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className="badge-muted">Period {period}</span>
        {time && (
          <span className="ml-1.5 text-[11px] text-[var(--muted)]">
            {time.start}–{time.end}
          </span>
        )}
      </div>
      {badge}
    </div>
  )
}
