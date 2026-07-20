'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { Role } from '@/lib/types'

export default function NavBar({ role }: { role: Role }) {
  const pathname = usePathname()
  const router = useRouter()

  const links = [
    { href: '/', label: 'Timetable' },
    { href: '/leave', label: 'Leave' },
    ...(role === 'admin' ? [{ href: '/substitutions', label: 'Substitutions' }] : []),
    { href: '/profile', label: 'Profile' },
    ...(role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex gap-5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium ${
              pathname === link.href ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <button onClick={handleSignOut} className="text-sm text-[var(--muted)]">
        Sign out
      </button>
    </nav>
  )
}
