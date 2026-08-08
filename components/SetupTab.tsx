'use client'

import { useState } from 'react'
import TeachersTab from './TeachersTab'
import SectionsTab from './SectionsTab'
import TimetableTab from './TimetableTab'

const SUB_TABS = ['Teachers', 'Sections', 'Timetable'] as const
type SubTab = (typeof SUB_TABS)[number]

export default function SetupTab() {
  const [subTab, setSubTab] = useState<SubTab>('Teachers')

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)]">
        {SUB_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              subTab === t
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === 'Teachers' && <TeachersTab />}
      {subTab === 'Sections' && <SectionsTab />}
      {subTab === 'Timetable' && <TimetableTab />}
    </div>
  )
}
