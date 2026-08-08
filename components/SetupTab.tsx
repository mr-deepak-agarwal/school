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
      <div className="tab-bar mb-6">
        {SUB_TABS.map((t) => (
          <button key={t} onClick={() => setSubTab(t)} className={`tab-btn ${subTab === t ? 'tab-btn-active' : ''}`}>
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
