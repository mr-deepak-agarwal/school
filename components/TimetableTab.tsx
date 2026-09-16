'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Section, Teacher, TimetableSlot } from '@/lib/types'
// DAYS and PERIODS live in one place (lib/periods.ts) — this used to keep a
// second, hand-copied set of period times here, which meant a schedule
// change (e.g. moving the lunch break) had to be made in two files or the
// Timetable and Substitutions tabs would quietly disagree with each other.
import { DAYS, PERIODS } from '@/lib/periods'

// 'section' is the original flow: pick a class/section, fill in its week.
// 'teacher' builds the same underlying rows the other way round: pick a
// teacher, then fill in which class they're with each period — handy for
// setting up someone's schedule directly instead of hunting for them across
// every section one at a time.
type BuildBy = 'section' | 'teacher'

function sectionLabel(s: Section) {
  return `Class ${s.class}${s.section}`
}

export default function TimetableTab() {
  const [sections, setSections] = useState<Section[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<string[]>([])

  const [buildBy, setBuildBy] = useState<BuildBy>('section')
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)

  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [form, setForm] = useState({
    day: 'Monday',
    period: '',
    subject: '',
    teacher_id: '', // used when buildBy === 'section'
    section_id: '', // used when buildBy === 'teacher'
  })
  const [error, setError] = useState('')

  // 'week' is the original full-grid builder — good on a wide screen for
  // adding periods anywhere at once. 'day' shows one weekday as a stacked,
  // fill-in-the-blank list of periods — the friendlier way to build a
  // section's (or teacher's) timetable from scratch on a phone, one period
  // at a time, the way the paper timetables in the photos actually get
  // filled in.
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [activeDay, setActiveDay] = useState(DAYS[0])
  const [addingPeriod, setAddingPeriod] = useState<number | null>(null)
  const [dayForm, setDayForm] = useState({ subject: '', teacher_id: '', section_id: '' })
  const [dayError, setDayError] = useState('')

  useEffect(() => {
    async function loadStatic() {
      const [{ data: s }, { data: t }, { data: allSlots }] = await Promise.all([
        supabase.from('sections').select('*').order('class').order('section'),
        supabase.from('teachers').select('*').order('name'),
        supabase.from('timetable').select('subject'),
      ])
      setSections((s ?? []) as Section[])
      setTeachers((t ?? []) as Teacher[])
      if (s && s.length > 0) setSectionId(s[0].id)
      if (t && t.length > 0) setTeacherId(t[0].id)

      // Subject dropdown options: every subject any teacher can teach,
      // plus every subject already used anywhere in the timetable (picks
      // up non-teacher periods like Sports, Library, Self Study, Class
      // Test, HOA, LA that don't belong to any teacher's subject list).
      const fromTeachers = ((t ?? []) as Teacher[]).flatMap((teacher) => teacher.subjects ?? [])
      const fromTimetable = ((allSlots ?? []) as { subject: string }[]).map((row) => row.subject)
      const all = Array.from(new Set([...fromTeachers, ...fromTimetable])).sort((a, b) => a.localeCompare(b))
      setSubjects(all)
    }
    loadStatic()
  }, [])

  async function loadSlots() {
    if (buildBy === 'section') {
      if (!sectionId) return
      const { data } = await supabase
        .from('timetable')
        .select('*')
        .eq('section_id', sectionId)
        .order('day')
        .order('period')
      setSlots((data ?? []) as TimetableSlot[])
    } else {
      if (!teacherId) return
      const { data } = await supabase
        .from('timetable')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('day')
        .order('period')
      setSlots((data ?? []) as TimetableSlot[])
    }
  }

  useEffect(() => {
    loadSlots()
    setError('')
    setDayError('')
    setAddingPeriod(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildBy, sectionId, teacherId])

  // A teacher can only be in one place each period. This checks the *other*
  // sections' rows for that day/period — thisSectionId is excluded so
  // editing/re-saving a teacher's own existing period isn't flagged against
  // itself.
  async function checkTeacherConflict(
    day: string,
    period: number,
    thisSectionId: number,
    teacherIdToCheck: string
  ): Promise<string | null> {
    const { data } = await supabase
      .from('timetable')
      .select('id, section_id')
      .eq('day', day)
      .eq('period', period)
      .eq('teacher_id', teacherIdToCheck)
    const clash = (data ?? []).find((r) => r.section_id !== thisSectionId)
    if (!clash) return null
    const sec = sections.find((s) => s.id === clash.section_id)
    const teacherName = teachers.find((t) => t.id === teacherIdToCheck)?.name ?? 'This teacher'
    return `${teacherName} already has a period with ${sec ? sectionLabel(sec) : 'another class'} at P${period} on ${day}.`
  }

  // Whether the section already has a row at this day/period — used when
  // building by teacher, since picking "Class 6A, period 3, Monday" needs
  // to know if 6A already has something there before adding a second row
  // for the same slot.
  async function checkSectionClash(
    day: string,
    period: number,
    sectionIdToCheck: number
  ): Promise<{ id: number; teacher_id: string | null; subject: string } | null> {
    const { data } = await supabase
      .from('timetable')
      .select('id, teacher_id, subject')
      .eq('day', day)
      .eq('period', period)
      .eq('section_id', sectionIdToCheck)
      .maybeSingle()
    return (data as { id: number; teacher_id: string | null; subject: string } | null) ?? null
  }

  // Shared insert logic for buildBy === 'section': the section is fixed
  // (the one currently selected), teacher is optional. Returns an error
  // message, or null on success.
  async function addSlotSectionMode(
    day: string,
    period: number,
    subject: string,
    teacherIdVal: string | null
  ): Promise<string | null> {
    if (!sectionId) return 'Pick a section first.'
    if (teacherIdVal) {
      const conflict = await checkTeacherConflict(day, period, sectionId, teacherIdVal)
      if (conflict) return conflict
    }
    const periodInfo = PERIODS.find((p) => p.period === period)
    const { error } = await supabase.from('timetable').insert({
      day,
      period,
      subject,
      teacher_id: teacherIdVal || null,
      section_id: sectionId,
      start_time: periodInfo?.start ?? null,
      end_time: periodInfo?.end ?? null,
    })
    return error ? error.message : null
  }

  // Shared insert logic for buildBy === 'teacher': the teacher is fixed,
  // section is required. If the chosen section/day/period already has an
  // unassigned row there, this claims it (updates it) instead of inserting
  // a duplicate; if it's already someone else's, it's blocked.
  async function addSlotTeacherMode(
    day: string,
    period: number,
    subject: string,
    newSectionId: number
  ): Promise<string | null> {
    if (!teacherId) return 'Pick a teacher first.'
    const teacherConflict = await checkTeacherConflict(day, period, newSectionId, teacherId)
    if (teacherConflict) return teacherConflict

    const clash = await checkSectionClash(day, period, newSectionId)
    if (clash) {
      if (clash.teacher_id && clash.teacher_id !== teacherId) {
        const otherName = teachers.find((t) => t.id === clash.teacher_id)?.name ?? 'another teacher'
        return `That class already has ${clash.subject} with ${otherName} at that time.`
      }
      const { error } = await supabase.from('timetable').update({ subject, teacher_id: teacherId }).eq('id', clash.id)
      return error ? error.message : null
    }

    const periodInfo = PERIODS.find((p) => p.period === period)
    const { error } = await supabase.from('timetable').insert({
      day,
      period,
      subject,
      teacher_id: teacherId,
      section_id: newSectionId,
      start_time: periodInfo?.start ?? null,
      end_time: periodInfo?.end ?? null,
    })
    return error ? error.message : null
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.period || !form.subject) return

    const msg =
      buildBy === 'section'
        ? await addSlotSectionMode(form.day, Number(form.period), form.subject, form.teacher_id || null)
        : form.section_id
          ? await addSlotTeacherMode(form.day, Number(form.period), form.subject, Number(form.section_id))
          : 'Pick a class/section for this period.'

    if (msg) {
      setError(msg)
      return
    }

    setForm({ day: form.day, period: '', subject: '', teacher_id: '', section_id: '' })
    loadSlots()
  }

  // Same inserts as addSlot, but driven by the day view's inline per-period
  // "+" rather than the week view's top form — day/period come from which
  // row was tapped instead of select inputs.
  async function addSlotForDay(period: number) {
    setDayError('')
    if (!dayForm.subject) return

    const msg =
      buildBy === 'section'
        ? await addSlotSectionMode(activeDay, period, dayForm.subject, dayForm.teacher_id || null)
        : dayForm.section_id
          ? await addSlotTeacherMode(activeDay, period, dayForm.subject, Number(dayForm.section_id))
          : 'Pick a class/section for this period.'

    if (msg) {
      setDayError(msg)
      return
    }

    setDayForm({ subject: '', teacher_id: '', section_id: '' })
    setAddingPeriod(null)
    loadSlots()
  }

  async function removeSlot(id: number) {
    await supabase.from('timetable').delete().eq('id', id)
    loadSlots()
  }

  async function updateSlotTeacher(id: number, newTeacherId: string) {
    const slot = slots.find((s) => s.id === id)
    if (!slot) return
    if (newTeacherId) {
      const conflict = await checkTeacherConflict(slot.day, slot.period, slot.section_id, newTeacherId)
      if (conflict) {
        setError(conflict)
        return
      }
    }
    setError('')
    await supabase.from('timetable').update({ teacher_id: newTeacherId || null }).eq('id', id)
    loadSlots()
  }

  // Teacher-mode equivalent of updateSlotTeacher: this teacher's period
  // stays fixed, but which class it's with can change.
  async function updateSlotSection(id: number, newSectionId: number) {
    const slot = slots.find((s) => s.id === id)
    if (!slot) return
    const clash = await checkSectionClash(slot.day, slot.period, newSectionId)
    if (clash && clash.id !== id) {
      const otherName = clash.teacher_id ? teachers.find((t) => t.id === clash.teacher_id)?.name : null
      const clashedSection = sections.find((s) => s.id === newSectionId)
      setError(
        `${clashedSection ? sectionLabel(clashedSection) : 'That class'} already has ${clash.subject}${
          otherName ? ` with ${otherName}` : ''
        } at that time — remove that period first.`
      )
      return
    }
    setError('')
    await supabase.from('timetable').update({ section_id: newSectionId }).eq('id', id)
    loadSlots()
  }

  async function updateSlotSubject(id: number, subject: string) {
    if (!subject) return
    setSubjects((prev) => (prev.includes(subject) ? prev : [...prev, subject].sort((a, b) => a.localeCompare(b))))
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, subject } : s)))
    const { error } = await supabase.from('timetable').update({ subject }).eq('id', id)
    if (error) loadSlots()
  }

  // In teacher mode, put that teacher's own subjects at the top of every
  // subject dropdown — still lets them be given anything else, just saves
  // scrolling for the common case.
  const orderedSubjects = (() => {
    if (buildBy !== 'teacher' || !teacherId) return subjects
    const own = teachers.find((t) => t.id === teacherId)?.subjects ?? []
    return [...subjects].sort((a, b) => {
      const aOwn = own.includes(a) ? 0 : 1
      const bOwn = own.includes(b) ? 0 : 1
      return aOwn !== bOwn ? aOwn - bOwn : a.localeCompare(b)
    })
  })()

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Build by</span>
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              onClick={() => setBuildBy('section')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                buildBy === 'section' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Class / section
            </button>
            <button
              type="button"
              onClick={() => setBuildBy('teacher')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                buildBy === 'teacher' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Teacher
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          {buildBy === 'section' ? (
            <div>
              <label className="mb-1 block text-sm font-medium">Section</label>
              <select value={sectionId ?? ''} onChange={(e) => setSectionId(Number(e.target.value))} className="input max-w-xs">
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">Teacher</label>
              <select value={teacherId ?? ''} onChange={(e) => setTeacherId(e.target.value)} className="input max-w-xs">
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                viewMode === 'week' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Week grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                viewMode === 'day' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              Day by day
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'day' && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setActiveDay(d)
                setAddingPeriod(null)
              }}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                activeDay === d ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'day' ? (
        <div className="space-y-2">
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {dayError && <p className="text-sm text-[var(--danger)]">{dayError}</p>}
          {PERIODS.map((p) => {
            const slot = slots.find((s) => s.day === activeDay && s.period === p.period)

            return (
              <div key={p.period} className="card !py-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-sm font-bold">P{p.period}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {p.start}–{p.end}
                    </div>
                  </div>
                  <div className="h-8 w-px shrink-0 bg-[var(--border)]" />

                  {slot ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <select
                        value={slot.subject}
                        onChange={(e) => updateSlotSubject(slot.id, e.target.value)}
                        className="input flex-1 py-1.5 text-sm font-medium"
                      >
                        {!subjects.includes(slot.subject) && <option value={slot.subject}>{slot.subject}</option>}
                        {orderedSubjects.map((subj) => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      {buildBy === 'section' ? (
                        <select
                          value={slot.teacher_id ?? ''}
                          onChange={(e) => updateSlotTeacher(slot.id, e.target.value)}
                          className="input flex-1 py-1.5 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={slot.section_id}
                          onChange={(e) => updateSlotSection(slot.id, Number(e.target.value))}
                          className="input flex-1 py-1.5 text-sm"
                        >
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {sectionLabel(s)}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => removeSlot(slot.id)}
                        className="btn-ghost btn-sm shrink-0 !text-[var(--danger)]"
                        title="Remove period"
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ) : addingPeriod === p.period ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <select
                        autoFocus
                        value={dayForm.subject}
                        onChange={(e) => setDayForm({ ...dayForm, subject: e.target.value })}
                        className="input flex-1 py-1.5 text-sm font-medium"
                      >
                        <option value="" disabled>
                          Choose a subject…
                        </option>
                        {orderedSubjects.map((subj) => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      {buildBy === 'section' ? (
                        <select
                          value={dayForm.teacher_id}
                          onChange={(e) => setDayForm({ ...dayForm, teacher_id: e.target.value })}
                          className="input flex-1 py-1.5 text-sm"
                        >
                          <option value="">Unassigned — allocate later</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={dayForm.section_id}
                          onChange={(e) => setDayForm({ ...dayForm, section_id: e.target.value })}
                          className="input flex-1 py-1.5 text-sm"
                        >
                          <option value="" disabled>
                            Choose a class…
                          </option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {sectionLabel(s)}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => addSlotForDay(p.period)}
                          disabled={!dayForm.subject || (buildBy === 'teacher' && !dayForm.section_id)}
                          className="btn-primary btn-sm"
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setAddingPeriod(null)
                            setDayError('')
                          }}
                          className="btn-secondary btn-sm"
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingPeriod(p.period)
                        setDayForm({ subject: '', teacher_id: '', section_id: '' })
                        setDayError('')
                      }}
                      className="btn-secondary btn-sm"
                      type="button"
                    >
                      + Add period
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
      <>
      <form
        onSubmit={addSlot}
        className="mb-6 grid grid-cols-2 gap-3 card sm:grid-cols-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Day</label>
          <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="input">
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Period</label>
          <select
            required
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })}
            className="input"
          >
            <option value="" disabled>
              Choose a period…
            </option>
            {PERIODS.map((p) => (
              <option key={p.period} value={p.period}>
                P{p.period} · {p.start}–{p.end}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <select
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="input"
          >
            <option value="" disabled>
              Choose a subject…
            </option>
            {orderedSubjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
        </div>
        <div>
          {buildBy === 'section' ? (
            <>
              <label className="mb-1 block text-sm font-medium">Teacher (optional)</label>
              <select
                value={form.teacher_id}
                onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                className="input"
              >
                <option value="">Unassigned — allocate later</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium">Class / section</label>
              <select
                required
                value={form.section_id}
                onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                className="input"
              >
                <option value="" disabled>
                  Choose a class…
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="col-span-2 sm:col-span-3">
          {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" className="btn-primary">
            Add period
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-strong)]">
        {/* table-fixed + w-full alone shrinks every column to fit the
            viewport on mobile, so the subject/teacher dropdowns and the
            remove button all get crushed into a few px and nothing is
            actually scrollable. Giving the table an explicit min-width
            (each period column gets a real minimum) makes it wider than
            a phone screen so it overflows this wrapper and the existing
            overflow-x-auto can do its job — swipe to see later periods
            instead of squinting at illegible columns. */}
        <table className="min-w-[1180px] table-fixed border-collapse text-sm sm:w-full sm:min-w-0">
          <colgroup>
            <col className="w-20" />
            {PERIODS.map((p) => (
              <col key={p.period} className="w-[110px] sm:w-auto" />
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
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="border-r border-b border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-xs font-semibold uppercase text-[var(--muted)]">
                  {day.slice(0, 3)}
                </td>
                {PERIODS.map((p) => {
                  const slot = slots.find((s) => s.day === day && s.period === p.period)
                  if (!slot) {
                    return (
                      <td
                        key={p.period}
                        className="border-b border-r border-[var(--border-strong)] px-1 py-2 text-center text-sm text-[var(--muted)] last:border-r-0"
                      >
                        —
                      </td>
                    )
                  }
                  return (
                    <td key={p.period} className="border-b border-r border-[var(--border-strong)] px-1.5 py-2 align-top last:border-r-0">
                      <div className="flex flex-col items-stretch gap-1">
                        <div className="flex items-start justify-between gap-1">
                          <select
                            value={slot.subject}
                            onChange={(e) => updateSlotSubject(slot.id, e.target.value)}
                            className="input w-full px-1 py-0.5 text-xs font-medium"
                          >
                            {!subjects.includes(slot.subject) && (
                              <option value={slot.subject}>{slot.subject}</option>
                            )}
                            {orderedSubjects.map((subj) => (
                              <option key={subj} value={subj}>
                                {subj}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeSlot(slot.id)}
                            className="shrink-0 text-xs leading-none text-[var(--danger)]"
                            title="Remove period"
                          >
                            ✕
                          </button>
                        </div>
                        {buildBy === 'section' ? (
                          <select
                            value={slot.teacher_id ?? ''}
                            onChange={(e) => updateSlotTeacher(slot.id, e.target.value)}
                            className="input w-full px-1 py-0.5 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={slot.section_id}
                            onChange={(e) => updateSlotSection(slot.id, Number(e.target.value))}
                            className="input w-full px-1 py-0.5 text-xs"
                          >
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>
                                {sectionLabel(s)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slots.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {buildBy === 'section' ? 'No periods added for this section yet.' : 'No periods added for this teacher yet.'}
        </p>
      )}
      </>
      )}
    </div>
  )
}
