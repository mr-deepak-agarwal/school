'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import { supabase } from '@/lib/supabaseClient'
import type { Teacher } from '@/lib/types'
import NotificationToggle from './NotificationToggle'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Working late'
}

// Any signed-in teacher (admin or not) gets in — what they see inside is
// up to the caller, via the render-prop below, so the admin's tab set and
// a teacher's simple view can each live in their own page without this
// shell needing to know the difference.
export default function AppShell({ children }: { children: (teacher: Teacher) => React.ReactNode }) {
  const { teacher, loading } = useCurrentTeacher()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !teacher) router.replace('/login')
  }, [loading, teacher, router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !teacher) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--muted)]">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--primary)]" />
          Loading…
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" width={34} height={34} alt="" className="shrink-0 rounded-[9px]" />
            <div>
              <p className="font-display text-base font-semibold leading-tight">School Timetable</p>
              <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-[var(--muted)]">
                {teacher.role === 'admin' ? 'Admin' : 'Teacher'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-display text-sm italic text-[var(--muted)] sm:inline">
              {greeting()}, <span className="font-semibold not-italic text-[var(--text)]">{teacher.name.split(' ')[0]}</span>
            </span>
            <NotificationToggle teacherId={teacher.id} />
            <button onClick={handleSignOut} className="btn-ghost btn-sm">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children(teacher)}</main>
    </div>
  )
}
