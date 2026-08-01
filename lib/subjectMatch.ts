import type { Teacher } from './types'

/**
 * Normalizes a subject label for comparison. Strips a trailing parenthetical
 * qualifier (e.g. "ICT (P)" -> "ict", "Science (Practical)" -> "science"),
 * trims whitespace, and lowercases — so "ICT" and "ICT (P)" are treated as
 * the same subject for substitute-matching purposes.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase()
}

export function subjectsMatch(a: string, b: string): boolean {
  return normalizeSubject(a) === normalizeSubject(b)
}

export function teacherTeachesSubject(teacher: Pick<Teacher, 'subjects'>, subject: string): boolean {
  return (teacher.subjects ?? []).some((s) => subjectsMatch(s, subject))
}

/**
 * Whether a teacher teaches the given section at all, in any period during
 * the week — not necessarily the subject in question. Used to relax the
 * substitute match for a teacher who has opted in as a preferred substitute
 * for a date: they're a good fit for a class they already know, even if
 * it's not their usual subject.
 */
export function teacherTeachesSection(
  teacherId: string,
  sectionId: number,
  weekTimetable: { teacher_id: string | null; section_id: number }[]
): boolean {
  return weekTimetable.some((row) => row.teacher_id === teacherId && row.section_id === sectionId)
}
