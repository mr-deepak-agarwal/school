'use client'

import { useState } from 'react'
import AppShell from '@/components/AppShell'
import SubstitutionsTab from '@/components/SubstitutionsTab'
import PreferredPeriodsTab from '@/components/PreferredPeriodsTab'
import SwappedPeriodsTab from '@/components/SwappedPeriodsTab'
import TimetableViewTab from '@/components/TimetableViewTab'
import SetupTab from '@/components/SetupTab'
import TeacherHome from '@/components/TeacherHome'
import TeacherLeavePanel from '@/components/TeacherLeavePanel'
import TeacherPreferredPanel from '@/components/TeacherPreferredPanel'
import type { Teacher } from '@/lib/types'

const TABS = ['Substitutions', 'Preferred Periods', 'Swapped Periods', 'Timetable', 'Setup'] as const
type Tab = (typeof TABS)[number]

const TEACHER_TABS = ['Your Day', 'Leave', 'Preferred'] as const
type TeacherTab = (typeof TEACHER_TABS)[number]

export default function HomePage() {
  return <AppShell>{(teacher) => (teacher.role === 'admin' ? <MainContent /> : <TeacherView teacher={teacher} />)}</AppShell>
}

// A teacher's own tab set — kept far lighter than the admin's, since
// "Your Day" (today's periods, defaulted) is what they land on and the
// other two are self-service requests rather than day-to-day tools.
function TeacherView({ teacher }: { teacher: Teacher }) {
  const [tab, setTab] = useState<TeacherTab>('Your Day')

  return (
    <div>
      <div className="tab-bar">
        {TEACHER_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn ${tab === t ? 'tab-btn-active' : ''}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="animate-fade-in" key={tab}>
        {tab === 'Your Day' && <TeacherHome teacher={teacher} />}
        {tab === 'Leave' && <TeacherLeavePanel teacher={teacher} />}
        {tab === 'Preferred' && <TeacherPreferredPanel teacher={teacher} />}
      </div>
    </div>
  )
}

function MainContent() {
  const [tab, setTab] = useState<Tab>('Substitutions')

  return (
    <div>
      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn ${tab === t ? 'tab-btn-active' : ''}`}>
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
