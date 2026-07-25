'use client'

import { useState } from 'react'
import AppShell from '@/components/AppShell'
import TeachersTab from '@/components/admin/TeachersTab'
import SectionsTab from '@/components/admin/SectionsTab'
import TimetableTab from '@/components/admin/TimetableTab'
import TimetableViewTab from '@/components/admin/TimetableViewTab'

const TABS = ['Teachers', 'Sections', 'Timetable', 'View Timetable'] as const
type Tab = (typeof TABS)[number]

export default function AdminPage() {
  return (
    <AppShell adminOnly wide>
      <AdminContent />
    </AppShell>
  )
}

function AdminContent() {
  const [tab, setTab] = useState<Tab>('Teachers')

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Admin</h1>
      <div className="mb-6 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              tab === t ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Teachers' && <TeachersTab />}
      {tab === 'Sections' && <SectionsTab />}
      {tab === 'Timetable' && <TimetableTab />}
      {tab === 'View Timetable' && <TimetableViewTab />}
    </div>
  )
}
