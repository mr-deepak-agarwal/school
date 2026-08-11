'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Section, Teacher } from '@/lib/types'

export default function TeachersTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    teacher_code: '',
    role: 'teacher',
    subjects: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('teachers').select('*').order('name'),
      supabase.from('sections').select('*'),
    ])
    setTeachers((t ?? []) as Teacher[])
    setSections((s ?? []) as Section[])
  }

  useEffect(() => {
    load()
  }, [])

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          teacher_code: form.teacher_code,
          role: form.role,
          subjects: form.subjects
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.detail || 'Could not create teacher.')
        setSaving(false)
        return
      }
    } catch {
      setError('Could not reach the backend. Is the API server running?')
      setSaving(false)
      return
    }

    setSaving(false)
    setForm({ name: '', email: '', password: '', teacher_code: '', role: 'teacher', subjects: '' })
    setShowForm(false)
    load()
  }

  async function updateRole(id: string, role: string) {
    await supabase.from('teachers').update({ role }).eq('id', id)
    load()
  }

  async function updateCt(id: string, ctSectionId: string) {
    await supabase
      .from('teachers')
      .update({ ct_section_id: ctSectionId ? Number(ctSectionId) : null })
      .eq('id', id)
    load()
  }

  async function updateSubjects(id: string, subjects: string[]) {
    setTeachers((prev) => prev.map((t) => (t.id === id ? { ...t, subjects } : t)))
    const { error } = await supabase.from('teachers').update({ subjects }).eq('id', id)
    if (error) load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--muted)]">Teachers ({teachers.length})</h2>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm font-medium text-[var(--primary)]">
          {showForm ? 'Cancel' : '+ Add teacher'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={addTeacher}
          className="mb-6 space-y-3 card"
        >
          <Field label="Full name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Temporary password">
            <input
              required
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Teacher ID">
            <input
              required
              value={form.teacher_code}
              onChange={(e) => setForm({ ...form, teacher_code: e.target.value })}
              className="input"
              placeholder="T001"
            />
          </Field>
          <Field label="Subjects (comma separated)">
            <input
              value={form.subjects}
              onChange={(e) => setForm({ ...form, subjects: e.target.value })}
              className="input"
              placeholder="Maths, Physics"
            />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Creating…' : 'Create teacher'}
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {teachers.map((t) => (
          <li key={t.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {t.name} <span className="text-[var(--muted)]">· {t.teacher_code}</span>
                </p>
                <p className="text-xs text-[var(--muted)]">{t.email}</p>
              </div>
              <select
                value={t.role}
                onChange={(e) => updateRole(t.id, e.target.value)}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
              >
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="shrink-0">Subjects:</span>
              <SubjectsEditor teacher={t} onChange={(subjects) => updateSubjects(t.id, subjects)} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>Class teacher of:</span>
              <select
                value={t.ct_section_id ?? ''}
                onChange={(e) => updateCt(t.id, e.target.value)}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
              >
                <option value="">None</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.class}
                    {s.section}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SubjectsEditor({ teacher, onChange }: { teacher: Teacher; onChange: (subjects: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function addSubject() {
    const value = draft.trim()
    if (!value) {
      setDraft('')
      return
    }
    if (!teacher.subjects.some((s) => s.toLowerCase() === value.toLowerCase())) {
      onChange([...teacher.subjects, value])
    }
    setDraft('')
  }

  function removeSubject(subject: string) {
    onChange(teacher.subjects.filter((s) => s !== subject))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSubject()
    } else if (e.key === 'Backspace' && !draft && teacher.subjects.length > 0) {
      removeSubject(teacher.subjects[teacher.subjects.length - 1])
    }
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1">
      {teacher.subjects.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[var(--fg,inherit)]"
        >
          {s}
          <button
            type="button"
            onClick={() => removeSubject(s)}
            className="text-[var(--muted)] hover:text-[var(--danger)]"
            aria-label={`Remove ${s}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addSubject}
        placeholder={teacher.subjects.length ? 'Add…' : 'No subjects set — add one'}
        className="min-w-[7rem] flex-1 border-none bg-transparent text-xs outline-none placeholder:text-[var(--muted)]"
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
