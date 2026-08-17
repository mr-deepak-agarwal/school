// Maps a subject label to a background tint so the timetable grid reads at
// a glance — academic periods stay neutral, breaks/tests/olympiads get a
// distinct wash using the same tokens already defined in globals.css.
export function subjectTone(subject: string): string {
  const s = subject.trim().toLowerCase()
  if (s === 'sports') return 'bg-[var(--success-bg)]'
  if (s === 'self study' || s === 'library') return 'bg-[var(--surface-sunken)]'
  if (s === 'class test') return 'bg-[var(--warn-bg)]'
  if (s.startsWith('imo') || s.startsWith('ieo') || s.startsWith('nso')) return 'bg-[var(--accent-tint)]'
  if (s === 'hoa' || s === 'la' || s === 'gp') return 'bg-[var(--primary-tint)]'
  return ''
}

// Given the fixed PERIODS array (school-day start/end strings like '1:25',
// which are always 9:20am–4:00pm even though the hour alone is ambiguous),
// figure out which period — if any — is happening right now. Hours 1–4
// mean PM here since the day never runs past 4pm or before 9am.
export function currentPeriodNumber(periods: { period: number; start: string; end: string }[]): number | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()

  function to24Minutes(t: string): number {
    const [hStr, mStr] = t.split(':')
    let h = Number(hStr)
    const m = Number(mStr)
    if (h >= 1 && h <= 4) h += 12
    return h * 60 + m
  }

  for (const p of periods) {
    const start = to24Minutes(p.start)
    const end = to24Minutes(p.end)
    if (nowMins >= start && nowMins < end) return p.period
  }
  return null
}
