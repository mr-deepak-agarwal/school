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
