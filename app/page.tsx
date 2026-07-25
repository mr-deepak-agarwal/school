'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import type { Substitution, TimetableSlot } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const PERIODS = [
  { period: 1, start: '9:20', end: '9:55' },
  { period: 2, start: '9:55', end: '10:30' },
  { period: 3, start: '10:45', end: '11:20' },
  { period: 4, start: '11:20', end: '11:55' },
  { period: 5, start: '11:55', end: '12:30' },
  { period: 6, start: '12:30', end: '1:05' },
  { period: 7, start: '1:25', end: '2:00' },
  { period: 8, start: '2:00', end: '2:35' },
  { period: 9, start: '2:35', end: '3:10' },
  { period: 10, start: '3:10', end: '4:00' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Monday of the week containing the given ISO date.
function weekStartOf(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const jsDay = d.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay
  d.setDate(d.getDate() + diffToMonday)
  return d
}

function addDays(d: Date, n: number) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function formatRange(start: Date, end: Date) {
  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

export default function TimetablePage() {
  return (
    <AppShell wide>
      <TimetableContent />
    </AppShell>
  )
}

function TimetableContent() {
  const { teacher } = useCurrentTeacher()
  const [anchorDate, setAnchorDate] = useState(todayISO())
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [subsOut, setSubsOut] = useState<Substitution[]>([]) // my periods someone else is covering
  const [subsIn, setSubsIn] = useState<(Substitution & { slot?: TimetableSlot })[]>([]) // periods I'm covering
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({})
  const [sectionMap, setSectionMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const todayIso = todayISO()
  const weekStart = useMemo(() => weekStartOf(anchorDate), [anchorDate])
  const weekDates = useMemo(
    () => DAYS.map((day, i) => ({ day, date: toISO(addDays(weekStart, i)) })),
    [weekStart]
  )
  const weekEndDate = weekDates[weekDates.length - 1].date

  useEffect(() => {
    async function loadLookups() {
      const [{ data: teachers }, { data: sections }] = await Promise.all([
        supabase.from('teachers').select('id, name'),
        supabase.from('sections').select('id, class, section'),
      ])
      setTeacherMap(Object.fromEntries((teachers ?? []).map((t: any) => [t.id, t.name])))
      setSectionMap(Object.fromEntries((sections ?? []).map((s: any) => [s.id, `${s.class}${s.section}`])))
    }
    loadLookups()
  }, [])

  useEffect(() => {
    if (!teacher) return

    async function loadWeek() {
      setLoading(true)

      // Timetable slots recur weekly, so we fetch by teacher only (not filtered
      // to this week) and place each slot into its weekday/period cell below.
      const { data: timetableRows } = await supabase
        .from('timetable')
        .select('*')
        .eq('teacher_id', teacher!.id)
        .order('day')
        .order('period')

      const { data: outgoing } = await supabase
        .from('substitutions')
        .select('*')
        .gte('date', weekDates[0].date)
        .lte('date', weekEndDate)
        .eq('original_teacher_id', teacher!.id)

      const { data: incoming } = await supabase
        .from('substitutions')
        .select('*')
        .gte('date', weekDates[0].date)
        .lte('date', weekEndDate)
        .eq('substitute_teacher_id', teacher!.id)

      let incomingWithSlot: (Substitution & { slot?: TimetableSlot })[] = []
      if (incoming && incoming.length > 0) {
        const timetableIds = incoming.map((s) => s.timetable_id)
        const { data: incomingSlots } = await supabase.from('timetable').select('*').in('id', timetableIds)
        incomingWithSlot = incoming.map((s) => ({
          ...s,
          slot: incomingSlots?.find((slot) => slot.id === s.timetable_id),
        }))
      }

      setSlots((timetableRows ?? []) as TimetableSlot[])
      setSubsOut((outgoing ?? []) as Substitution[])
      setSubsIn(incomingWithSlot)
      setLoading(false)
    }

    loadWeek()
    // weekDates is derived from weekStart, so depending on weekStart is sufficient
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher, weekStart])

  const slotsByDay = useMemo(() => {
    const map: Record<string, TimetableSlot[]> = {}
    for (const day of DAYS) {
      map[day] = slots.filter((s) => s.day === day)
    }
    return map
  }, [slots])

  // Substitutions are logged against a specific date, so a slot that recurs
  // weekly must only be marked "covered" on the exact date it was subbed for.
  const subsOutByDate = useMemo(() => {
    const map: Record<string, Record<number, Substitution>> = {}
    for (const s of subsOut) {
      if (!map[s.date]) map[s.date] = {}
      map[s.date][s.timetable_id] = s
    }
    return map
  }, [subsOut])

  // Incoming coverage keyed by date + the period of the class being covered.
  const incomingByDateAndPeriod = useMemo(() => {
    const map: Record<string, Record<number, Substitution & { slot?: TimetableSlot }>> = {}
    for (const s of subsIn) {
      if (!s.slot) continue
      if (!map[s.date]) map[s.date] = {}
      map[s.date][s.slot.period] = s
    }
    return map
  }, [subsIn])

  const weekHasNothing = !loading && slots.length === 0 && subsIn.length === 0

  function goToWeek(offset: number) {
    setAnchorDate(toISO(addDays(weekStart, offset * 7)))
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToWeek(-1)}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--surface)]"
            aria-label="Previous week"
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold">{formatRange(weekStart, addDays(weekStart, DAYS.length - 1))}</h1>
          <button
            onClick={() => goToWeek(1)}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--surface)]"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchorDate(todayISO())}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--surface)]"
          >
            This week
          </button>
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : weekHasNothing ? (
        <p className="text-sm text-[var(--muted)]">No periods scheduled this week.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-strong)]">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-24" />
              {PERIODS.map((p) => (
                <col key={p.period} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border-b border-r border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-left text-xs font-semibold uppercase text-[var(--muted)]">
                  Day
                </th>
                {PERIODS.map((p) => (
                  <th
                    key={p.period}
                    className="border-b border-r border-[var(--border-strong)] bg-[var(--surface)] px-1 py-2 text-center text-xs font-semibold uppercase text-[var(--muted)] last:border-r-0"
                  >
                    P{p.period}
                    <div className="mt-0.5 text-[11px] font-normal normal-case text-[var(--muted)]">
                      {p.start}–{p.end}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map(({ day, date }) => {
                const isToday = date === todayIso
                return (
                  <tr key={day} className={isToday ? 'bg-[var(--primary)]/5' : undefined}>
                    <td className="border-r border-b border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-xs font-semibold uppercase text-[var(--muted)]">
                      {day.slice(0, 3)}
                      <div
                        className={`mt-0.5 text-[11px] font-normal normal-case ${
                          isToday ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
                        }`}
                      >
                        {date}
                      </div>
                    </td>
                    {PERIODS.map((p) => {
                      const ownSlot = slotsByDay[day]?.find((s) => s.period === p.period)
                      const incoming = incomingByDateAndPeriod[date]?.[p.period]

                      if (incoming) {
                        return (
                          <td
                            key={p.period}
                            className="border-b border-r border-[var(--primary)] bg-[var(--primary)]/5 px-1.5 py-2 text-center align-top last:border-r-0"
                          >
                            <div className="truncate text-sm font-medium leading-tight" title={incoming.slot?.subject}>
                              {incoming.slot?.subject}
                            </div>
                            <div className="mt-1 truncate text-xs text-[var(--muted)]">
                              {incoming.slot ? `Section ${sectionMap[incoming.slot.section_id] ?? ''}` : ''}
                            </div>
                            <div className="mt-1 truncate text-xs font-medium text-[var(--primary)]">
                              Covering for {teacherMap[incoming.original_teacher_id] ?? 'a teacher'}
                            </div>
                          </td>
                        )
                      }

                      if (!ownSlot) {
                        return (
                          <td
                            key={p.period}
                            className="border-b border-r border-[var(--border-strong)] px-1 py-2 text-center text-sm text-[var(--muted)] last:border-r-0"
                          >
                            —
                          </td>
                        )
                      }

                      const coveringSub = subsOutByDate[date]?.[ownSlot.id]
                      const isCovered = !!coveringSub

                      return (
                        <td
                          key={p.period}
                          className={`border-b border-r px-1.5 py-2 text-center align-top last:border-r-0 ${
                            isCovered
                              ? 'border-[var(--warn)] bg-[var(--warn-bg)]'
                              : 'border-[var(--border-strong)]'
                          }`}
                        >
                          <div className="truncate text-sm font-medium leading-tight" title={ownSlot.subject}>
                            {ownSlot.subject}
                          </div>
                          <div className="mt-1 truncate text-xs text-[var(--muted)]">
                            Section {sectionMap[ownSlot.section_id] ?? ''}
                          </div>
                          {isCovered && (
                            <div className="mt-1 truncate text-xs font-medium text-[var(--warn)]">
                              Covered by {teacherMap[coveringSub!.substitute_teacher_id] ?? 'another teacher'}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
