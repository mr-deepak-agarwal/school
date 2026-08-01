'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import { supabase } from '@/lib/supabaseClient'

// Admin-only app: any signed-in non-admin is bounced back to login rather
// than shown a page meant for admins.
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
        Loading…
      </div>
    )
  }

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <span className="text-sm font-semibold">School Timetable — Admin</span>
        <button onClick={handleSignOut} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  )
}
