'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Wrong email or password.')
      return
    }
    router.push('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Same mark + wordmark as the signed-in header — the login screen
            is the first thing anyone sees, so it should look like the same
            product as everything after it, not a generic auth template. */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <svg width="40" height="40" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <rect width="34" height="34" rx="9" fill="var(--primary)" />
            <path d="M8 21.5c3-2 6-2 9 0s6 2 9 0" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8 16.5c3-2 6-2 9 0s6 2 9 0" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
            <circle cx="26.5" cy="8.5" r="3" fill="var(--accent)" />
          </svg>
          <div className="text-left">
            <p className="font-display text-lg font-semibold leading-tight">School Timetable</p>
            <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-[var(--muted)]">
              Sign in to continue
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="card">
          <label className="section-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            className="input mb-4"
          />

          <label className="section-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input mb-1"
          />

          {error && (
            <p className="mt-3 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary mt-5 w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">Use your school email — ask the admin if you don&rsquo;t have one yet.</p>
      </div>
    </div>
  )
}
