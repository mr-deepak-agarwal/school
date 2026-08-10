export type Role = 'teacher' | 'admin'

export interface Teacher {
  id: string
  teacher_code: string
  name: string
  email: string
  role: Role
  subjects: string[]
  ct_section_id: number | null
  cct_classes: number[]
}

export interface Section {
  id: number
  class: number
  section: string
}

export interface TimetableSlot {
  id: number
  day: string
  period: number
  start_time: string | null
  end_time: string | null
  section_id: number
  subject: string
  teacher_id: string | null
}

export interface LeaveRequest {
  id: number
  date: string
  teacher_id: string
  reason: string | null
  status: 'pending' | 'approved'
  half: 'full' | 'first' | 'second' | 'q1' | 'q2' | 'q3' | 'q4'
}

export interface Substitution {
  id: number
  date: string
  timetable_id: number
  original_teacher_id: string
  substitute_teacher_id: string
}

export interface SlotNote {
  id: number
  timetable_id: number
  date: string
  note: string
  updated_by: string | null
  updated_at: string
}

export interface PreferredSub {
  id: number
  teacher_id: string
  section_id: number
  preferred: boolean
  // Set to true once this preference has actually been used to cover a
  // substitution for that teacher/section — kept as a record rather than
  // deleted, and no longer counts toward suggesting that teacher again.
  fulfilled: boolean
}

// Two teachers trading periods with each other on a given date — no
// substitute involved, each covers the other's class.
export interface PeriodSwap {
  id: number
  swap_date: string
  teacher_a: string
  period_a: number
  teacher_b: string
  period_b: number
}