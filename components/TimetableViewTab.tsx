'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { PeriodSwap, Section, Teacher, TimetableSlot } from '@/lib/types'
import { swapFor, swapPartner } from '@/lib/periodSwaps'
import { PERIODS, DAYS, todayISO, mondayOfWeek, weekDates, formatWeekLabel, addDays } from '@/lib/periods'

export default function TimetableViewTab() {
  // The grid always shows a full Mon–Fri week, so navigation moves by
  // whole weeks (weekStart = that week's Monday) rather than picking a
  // single date to land on — a single-day picker never matched what was
  // actually on screen.
  const [weekStart, setWeekStart] = useState(mondayOfWeek(todayISO()))
  // 'week' shows the full Mon–Fri grid (best on a wide screen); 'day'
  // shows one day as a stacked list of periods — the more usable option
  // on a phone, where a 10-column table forces constant horizontal
  // scrolling just to read one class's subject.
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [dayIndex, setDayIndex] = useState(() => {
    const jsDay = new Date().getDay() // 0 Sun .. 6 Sat
    return jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : 0
  })
  const [sections, setSections] = useState<Section[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacherId, setTeacherId] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  // Keyed by `${date}|${timetable_id}` so each concrete date in the week
  // gets its own substitution/swap lookup instead of sharing one.
  const [subsByKey, setSubsByKey] = useState<Record<string, string>>({})
  const [swapsByDate, setSwapsByDate] = useState<Record<string, PeriodSwap[]>>({})
  // Periods this teacher has picked up as a substitute for someone else —
  // shown in their own timetable so it's obvious they're not free then.
  // Keyed by date since a different week can have different coverage.
  const [coveringByDate, setCoveringByDate] = useState<
    Record<string, { period: number; section_id: number; subject: string; original_teacher_id: string }[]>
  >({})
  const [loading, setLoading] = useState(false)

  const today = todayISO()
  const dates = useMemo(() => weekDates(weekStart), [weekStart])

  // Steps the day view forward/back by one weekday, rolling into the
  // adjacent week (and re-syncing weekStart, which everything else keys
  // off) when stepping past Monday or Friday.
  function stepDay(delta: 1 | -1) {
    const next = dayIndex + delta
    if (next < 0) {
      setWeekStart((w) => addDays(w, -7))
      setDayIndex(4)
    } else if (next > 4) {
      setWeekStart((w) => addDays(w, 7))
      setDayIndex(0)
    } else {
      setDayIndex(next)
    }
  }

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('sections').select('*').order('class').order('section'),
        supabase.from('teachers').select('*').order('name'),
      ])
      setSections((s ?? []) as Section[])
      setTeachers((t ?? []) as Teacher[])
    }
    loadStatic()
  }, [])

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t) => [t.id, t.name])), [teachers])
  const sectionMap = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.id, `${s.class}${s.section}`])),
    [sections]
  )
  const classOptions = useMemo(
    () => Array.from(new Set(sections.map((s) => s.class))).sort((a, b) => a - b),
    [sections]
  )
  const sectionOptions = useMemo(
    () => sections.filter((s) => !classFilter || s.class === Number(classFilter)),
    [sections, classFilter]
  )

  // Selecting a teacher takes precedence; otherwise fall back to class+section.
  const mode: 'teacher' | 'section' | 'none' = teacherId ? 'teacher' : sectionId ? 'section' : 'none'

  // One place that figures out what a given (day, period) cell should show
  // — a substitute-coverage period, an empty slot, or a real one with its
  // sub/swap indicators — reused by both the week table's <td> and the
  // day view's stacked cards so the two never drift out of sync.
  type CellInfo =
    | { kind: 'covering'; subject: string; sectionLabel: string; coveringFor: string }
    | { kind: 'empty' }
    | {
        kind: 'slot'
        subject: string
        secondaryLabel: string
        subLabel?: string
        swapLabel?: string
      }

  function cellInfo(day: string, rowDate: string, period: number): CellInfo {
    const rowSwaps = swapsByDate[rowDate] ?? []
    const rowCovering = coveringByDate[rowDate] ?? []
    const covering = mode === 'teacher' ? rowCovering.find((c) => c.period === period) : undefined

    if (covering) {
      return {
        kind: 'covering',
        subject: covering.subject,
        sectionLabel: sectionMap[covering.section_id] ?? '',
        coveringFor: teacherMap[covering.original_teacher_id] ?? '?',
      }
    }

    const slot = slots.find((s) => s.day === day && s.period === period)
    if (!slot) return { kind: 'empty' }

    const subId = subsByKey[`${rowDate}|${slot.id}`]
    const swap = slot.teacher_id ? swapFor(rowSwaps, slot.teacher_id, Number(slot.period)) : undefined

    return {
      kind: 'slot',
      subject: slot.subject,
      secondaryLabel:
        mode === 'teacher'
          ? `Class ${sectionMap[slot.section_id] ?? ''}`
          : slot.teacher_id
            ? teacherMap[slot.teacher_id]
            : 'Unassigned',
      subLabel: subId ? `Sub: ${teacherMap[subId] ?? '?'}` : undefined,
      swapLabel: swap ? `Swap: ${teacherMap[swapPartner(swap, slot.teacher_id!).partnerId] ?? '?'}` : undefined,
    }
  }

  useEffect(() => {
    async function load() {
      if (mode === 'none') {
        setSlots([])
        return
      }
      setLoading(true)

      const { data } =
        mode === 'teacher'
          ? await supabase.from('timetable').select('*').eq('teacher_id', teacherId).order('day').order('period')
          : await supabase
              .from('timetable')
              .select('*')
              .eq('section_id', Number(sectionId))
              .order('day')
              .order('period')
      setSlots((data ?? []) as TimetableSlot[])

      // Pull substitutions + swaps for every date in the displayed week,
      // not just one — each weekday row needs its own date's coverage.
      const [{ data: subs }, { data: swapRows }] = await Promise.all([
        supabase.from('substitutions').select('*').in('date', dates),
        supabase.from('period_swaps').select('*').in('swap_date', dates),
      ])
      setSubsByKey(
        Object.fromEntries((subs ?? []).map((s: any) => [`${s.date}|${s.timetable_id}`, s.substitute_teacher_id]))
      )
      const swapsGrouped: Record<string, PeriodSwap[]> = {}
      for (const s of (swapRows ?? []) as PeriodSwap[]) {
        ;(swapsGrouped[s.swap_date] ??= []).push(s)
      }
      setSwapsByDate(swapsGrouped)

      // If we're looking at one teacher's timetable, also pull in any
      // periods they've picked up as a substitute across the week —
      // otherwise their timetable would (wrongly) look free during those
      // periods on the dates they're actually covering.
      if (mode === 'teacher') {
        const { data: coverSubs } = await supabase
          .from('substitutions')
          .select('*')
          .eq('substitute_teacher_id', teacherId)
          .in('date', dates)
        const timetableIds = Array.from(new Set((coverSubs ?? []).map((s: any) => s.timetable_id)))
        const { data: coverTimetable } =
          timetableIds.length > 0 ? await supabase.from('timetable').select('*').in('id', timetableIds) : { data: [] }
        const timetableById = Object.fromEntries(((coverTimetable ?? []) as any[]).map((t) => [t.id, t]))
        const grouped: Record<string, { period: number; section_id: number; subject: string; original_teacher_id: string }[]> = {}
        for (const s of (coverSubs ?? []) as any[]) {
          const row = timetableById[s.timetable_id]
          if (!row) continue
          ;(grouped[s.date] ??= []).push({
            period: Number(row.period),
            section_id: row.section_id,
            subject: row.subject,
            original_teacher_id: s.original_teacher_id,
          })
        }
        setCoveringByDate(grouped)
      } else {
        setCoveringByDate({})
      }

      setLoading(false)
    }
    load()
  }, [mode, teacherId, sectionId, dates])

  function clearOtherFilters(next: 'teacher' | 'section') {
    if (next === 'teacher') {
      setClassFilter('')
      setSectionId('')
    } else {
      setTeacherId('')
    }
  }

  return (
    <div>
      <div className="card mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Week</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="btn-secondary btn-sm px-2"
              aria-label="Previous week"
              type="button"
            >
              ‹
            </button>
            <span className="flex-1 whitespace-nowrap px-1 text-center text-sm font-semibold">
              {formatWeekLabel(weekStart)}
            </span>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="btn-secondary btn-sm px-2"
              aria-label="Next week"
              type="button"
            >
              ›
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => setWeekStart(mondayOfWeek(today))}
              className="text-xs font-medium text-[var(--muted)] hover:text-[var(--primary)]"
              type="button"
            >
              This week
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(mondayOfWeek(e.target.value))}
              aria-label="Jump to the week containing a specific date"
              className="input !w-auto flex-1 !py-1 !px-2 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Teacher</label>
          <select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value)
              if (e.target.value) clearOtherFilters('teacher')
            }}
            className="input"
          >
            <option value="">Any teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Class</label>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value)
              setSectionId('')
              if (e.target.value) clearOtherFilters('section')
            }}
            className="input"
          >
            <option value="">Any class</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value)
              if (e.target.value) clearOtherFilters('section')
            }}
            className="input"
          >
            <option value="">Any section</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                Class {s.class}
                {s.section}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {teacherId ? (
          <p className="text-sm text-[var(--muted)]">
            Showing <span className="font-medium text-[var(--text)]">{teacherMap[teacherId]}</span>&rsquo;s timetable
            across all classes.
          </p>
        ) : (
          <span />
        )}

        {mode !== 'none' && (
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                viewMode === 'week' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                viewMode === 'day' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Day
            </button>
          </div>
        )}
      </div>

      {mode !== 'none' && viewMode === 'day' && (
        <div className="mb-4 flex items-center justify-center gap-3">
          <button onClick={() => stepDay(-1)} className="btn-secondary btn-sm px-2" aria-label="Previous day" type="button">
            ‹
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold">
            {DAYS[dayIndex]}
            <span className="ml-1.5 font-normal text-[var(--muted)]">{dates[dayIndex]}</span>
          </span>
          <button onClick={() => stepDay(1)} className="btn-secondary btn-sm px-2" aria-label="Next day" type="button">
            ›
          </button>
        </div>
      )}

      {mode === 'none' ? (
        <p className="text-sm text-[var(--muted)]">Pick a teacher, or a class &amp; section, to see a timetable.</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No periods found for this selection.</p>
      ) : viewMode === 'day' ? (
        <div className="space-y-2">
          {PERIODS.map((p) => {
            const info = cellInfo(DAYS[dayIndex], dates[dayIndex], p.period)
            return (
              <div
                key={p.period}
                className={`card flex items-center gap-3 !py-3 ${info.kind === 'covering' ? 'bg-[var(--primary-tint)]' : ''}`}
              >
                <div className="w-16 shrink-0 text-center">
                  <div className="text-sm font-bold">P{p.period}</div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {p.start}–{p.end}
                  </div>
                </div>
                <div className="h-8 w-px shrink-0 bg-[var(--border)]" />
                {info.kind === 'empty' ? (
                  <div className="text-sm text-[var(--muted)]">Free</div>
                ) : info.kind === 'covering' ? (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{info.subject}</div>
                    <div className="truncate text-xs text-[var(--muted)]">Class {info.sectionLabel}</div>
                    <div className="truncate text-xs font-medium text-[var(--primary)]">
                      Covering for {info.coveringFor}
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{info.subject}</div>
                    <div className="truncate text-xs text-[var(--muted)]">{info.secondaryLabel}</div>
                    {info.subLabel && (
                      <div className="truncate text-xs font-medium text-[var(--danger)]">{info.subLabel}</div>
                    )}
                    {info.swapLabel && (
                      <div className="truncate text-xs font-medium text-[var(--warn)]">{info.swapLabel}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-24" />
            {PERIODS.map((p) => (
              <col key={p.period} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-r border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-left text-[11px] font-semibold uppercase text-[var(--muted)]">
                Day
              </th>
              {PERIODS.map((p) => (
                <th
                  key={p.period}
                  className="border-b border-[var(--border)] bg-[var(--surface)] px-1 py-2 text-center text-[11px] font-semibold uppercase text-[var(--muted)]"
                >
                  P{p.period}
                  <div className="mt-0.5 text-[9px] font-normal normal-case text-[var(--muted)]">
                    {p.start}–{p.end}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, rowDayIndex) => {
              const rowDate = dates[rowDayIndex]
              const isToday = rowDate === today

              return (
                <tr key={day} className={isToday ? 'bg-[var(--primary)]/5' : undefined}>
                  <td className="border-r border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[11px] font-semibold uppercase text-[var(--muted)]">
                    {day.slice(0, 3)}
                    <div className={`mt-0.5 text-[9px] font-normal normal-case ${isToday ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>
                      {rowDate}
                    </div>
                  </td>
                  {PERIODS.map((p) => {
                    const info = cellInfo(day, rowDate, p.period)

                    if (info.kind === 'covering') {
                      return (
                        <td
                          key={p.period}
                          className="border-b border-[var(--border)] bg-[var(--primary-tint)] px-1.5 py-2 align-top"
                        >
                          <div className="truncate text-xs font-medium leading-tight" title={info.subject}>
                            {info.subject}
                          </div>
                          <div className="mt-1 truncate text-[10px] text-[var(--muted)]">
                            Class {info.sectionLabel}
                          </div>
                          <div className="mt-1 truncate text-[10px] font-medium text-[var(--primary)]">
                            Covering for {info.coveringFor}
                          </div>
                        </td>
                      )
                    }

                    if (info.kind === 'empty') {
                      return (
                        <td
                          key={p.period}
                          className="border-b border-[var(--border)] px-1 py-2 text-center text-xs text-[var(--muted)]"
                        >
                          —
                        </td>
                      )
                    }

                    return (
                      <td key={p.period} className="border-b border-[var(--border)] px-1.5 py-2 align-top">
                        <div className="truncate text-xs font-medium leading-tight" title={info.subject}>
                          {info.subject}
                        </div>
                        <div className="mt-1 truncate text-[10px] text-[var(--muted)]">{info.secondaryLabel}</div>
                        {info.subLabel && (
                          <div className="mt-1 truncate text-[10px] font-medium text-[var(--danger)]">
                            {info.subLabel}
                          </div>
                        )}
                        {info.swapLabel && (
                          <div className="mt-1 truncate text-[10px] font-medium text-[var(--warn)]">
                            {info.swapLabel}
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
