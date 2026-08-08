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
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 whitespace-nowrap rounded-lg border-2 px-3 py-2 text-sm font-bold transition-all ${
              tab === t
                ? 'border-[var(--ink)] bg-[var(--primary)] text-white shadow-[var(--shadow-press)]'
                : 'border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
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
