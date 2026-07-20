'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { useCurrentTeacher } from '@/lib/useCurrentTeacher'

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  )
}

function ProfileContent() {
  const { teacher } = useCurrentTeacher()
  const [ctSection, setCtSection] = useState('')
  const [cctSections, setCctSections] = useState<string[]>([])

  useEffect(() => {
    async function loadSections() {
      if (!teacher) return
      const { data } = await supabase.from('sections').select('id, class, section')
      const map = Object.fromEntries((data ?? []).map((s: any) => [s.id, `${s.class}${s.section}`]))
      if (teacher.ct_section_id) setCtSection(map[teacher.ct_section_id] ?? '')
      setCctSections((teacher.cct_classes ?? []).map((id) => map[id]).filter(Boolean))
    }
    loadSections()
  }, [teacher])

  if (!teacher) return null

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Profile</h1>
      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <Row label="Name" value={teacher.name} />
        <Row label="Teacher ID" value={teacher.teacher_code} />
        <Row label="Email" value={teacher.email} />
        <Row label="Subjects" value={teacher.subjects.join(', ') || '—'} />
        <Row label="Class teacher of" value={ctSection || '—'} />
        <Row label="Co-class teacher of" value={cctSections.join(', ') || '—'} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
