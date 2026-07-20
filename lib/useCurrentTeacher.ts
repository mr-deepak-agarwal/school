'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { Teacher } from './types'

export function useCurrentTeacher() {
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        if (active) {
          setTeacher(null)
          setLoading(false)
        }
        return
      }

      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (active) {
        setTeacher(data as Teacher)
        setLoading(false)
      }
    }

    load()

    const { data: listener } = supabase.auth.onAuthStateChange(() => load())
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { teacher, loading }
}
