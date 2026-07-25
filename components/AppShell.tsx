'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'
import NavBar from './NavBar'

export default function AppShell({
  children,
  adminOnly = false,
  wide = false,
}: {
  children: React.ReactNode
  adminOnly?: boolean
  wide?: boolean
}) {
  const { teacher, loading } = useCurrentTeacher()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !teacher) router.replace('/login')
    if (!loading && teacher && adminOnly && teacher.role !== 'admin') router.replace('/')
  }, [loading, teacher, adminOnly, router])

  if (loading || !teacher) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    )
  }

  return (
    <div>
      <NavBar role={teacher.role} />
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-[1600px]' : 'max-w-2xl'}`}>{children}</main>
    </div>
  )
}
