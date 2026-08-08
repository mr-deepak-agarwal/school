'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import { supabase } from '@/lib/supabaseClient'

// Admin-only app: any signed-in non-admin is bounced back to login rather
// than shown a page meant for admins.
function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Working late'
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { teacher, loading } = useCurrentTeacher()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !teacher) router.replace('/login')
    if (!loading && teacher && teacher.role !== 'admin') {
      supabase.auth.signOut().then(() => router.replace('/login'))
    }
  }, [loading, teacher, router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !teacher || teacher.role !== 'admin') {
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
      <header className="sticky top-0 z-10 border-b-2 border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[var(--ink)] bg-[var(--primary)] text-sm font-bold text-white shadow-[var(--shadow-press)]">
              S
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">School Timetable</p>
              <p className="text-[11px] leading-tight text-[var(--muted)]">Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--muted)] sm:inline">
              {greeting()}, <span className="font-semibold text-[var(--text)]">{teacher.name.split(' ')[0]}</span>
            </span>
            <button onClick={handleSignOut} className="btn-ghost btn-sm">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  )
}
