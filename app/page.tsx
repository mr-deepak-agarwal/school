'use client'

import { useState } from 'react'
import AppShell from '@/components/AppShell'
import SubstitutionsTab from '@/components/SubstitutionsTab'
import PreferredPeriodsTab from '@/components/PreferredPeriodsTab'
import SwappedPeriodsTab from '@/components/SwappedPeriodsTab'
import TimetableViewTab from '@/components/TimetableViewTab'
import SetupTab from '@/components/SetupTab'

const TABS = ['Substitutions', 'Preferred Periods', 'Swapped Periods', 'Timetable', 'Setup'] as const
type Tab = (typeof TABS)[number]

export default function HomePage() {
  return (
    <AppShell>
      <MainContent />
    </AppShell>
  )
}

function MainContent() {
  const [tab, setTab] = useState<Tab>('Substitutions')

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="animate-fade-in" key={tab}>
        {tab === 'Substitutions' && <SubstitutionsTab />}
        {tab === 'Preferred Periods' && <PreferredPeriodsTab />}
        {tab === 'Swapped Periods' && <SwappedPeriodsTab />}
        {tab === 'Timetable' && <TimetableViewTab />}
        {tab === 'Setup' && <SetupTab />}
      </div>
    </div>
  )
}
