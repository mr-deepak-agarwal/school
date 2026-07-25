'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import type { Substitution, TimetableSlot } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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

function formatDayDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function TimetablePage() {
  return (
    <AppShell>
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
      // to this week) and place each slot into its weekday column below.
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
      map[day] = slots.filter((s) => s.day === day).sort((a, b) => a.period - b.period)
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

  const incomingByDate = useMemo(() => {
    const map: Record<string, (Substitution & { slot?: TimetableSlot })[]> = {}
    for (const s of subsIn) {
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    }
    return map
  }, [subsIn])

  const weekHasNothing =
    !loading &&
    weekDates.every(({ day, date }) => (slotsByDay[day]?.length ?? 0) === 0 && (incomingByDate[date]?.length ?? 0) === 0)

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
        <div className="space-y-6">
          {weekDates.map(({ day, date }) => {
            const daySlots = slotsByDay[day] ?? []
            const dayIncoming = incomingByDate[date] ?? []
            const isToday = date === todayIso

            if (daySlots.length === 0 && dayIncoming.length === 0) return null

            return (
              <div key={day}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${isToday ? 'text-[var(--primary)]' : ''}`}>{day}</h2>
                  <span className="text-xs text-[var(--muted)]">{formatDayDate(date)}</span>
                  {isToday && (
                    <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
                      Today
                    </span>
                  )}
                </div>

                <ul className="space-y-3">
                  {daySlots.map((slot) => {
                    const coveringSub = subsOutByDate[date]?.[slot.id]
                    const isCovered = !!coveringSub
                    return (
                      <li
                        key={slot.id}
                        className={`rounded-lg border p-4 ${
                          isCovered
                            ? 'border-[var(--warn)] bg-[var(--warn-bg)]'
                            : 'border-[var(--border)] bg-[var(--surface)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Period {slot.period}</span>
                          {slot.start_time && (
                            <span className="text-xs text-[var(--muted)]">{slot.start_time.slice(0, 5)}</span>
                          )}
                        </div>
                        <p className="mt-1 text-base font-semibold">{slot.subject}</p>
                        <p className="text-sm text-[var(--muted)]">Section {sectionMap[slot.section_id]}</p>
                        {isCovered && (
                          <p className="mt-2 text-sm font-medium text-[var(--warn)]">
                            Covered by {teacherMap[coveringSub!.substitute_teacher_id] ?? 'another teacher'}
                          </p>
                        )}
                      </li>
                    )
                  })}

                  {dayIncoming.map((s) => (
                    <li key={`in-${s.id}`} className="rounded-lg border border-[var(--primary)] bg-white p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Period {s.slot?.period ?? '?'}</span>
                        {s.slot?.start_time && (
                          <span className="text-xs text-[var(--muted)]">{s.slot.start_time.slice(0, 5)}</span>
                        )}
                      </div>
                      <p className="mt-1 text-base font-semibold">{s.slot?.subject}</p>
                      <p className="text-sm text-[var(--muted)]">
                        Section {s.slot ? sectionMap[s.slot.section_id] : ''}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--primary)]">
                        Covering for {teacherMap[s.original_teacher_id] ?? 'a teacher'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
