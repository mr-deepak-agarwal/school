import { supabase } from './supabaseClient'
import { AUTO_PREFERRED_THRESHOLD } from './workload'

/**
 * After a substitution is saved, check whether the substitute has now
 * covered this exact section AUTO_PREFERRED_THRESHOLD times or more. If
 * so, automatically opt them in as a preferred substitute for that
 * section (same effect as marking it by hand on the Preferred Periods
 * tab) so future suggestions bubble them to the top without the admin
 * having to notice the pattern themselves.
 *
 * Returns true if this call is what pushed them over the threshold (i.e.
 * a fresh auto-preference was created), so the caller can surface a note.
 */
export async function maybeAutoMarkPreferred(teacherId: string, sectionId: number): Promise<boolean> {
  const { data: subs } = await supabase
    .from('substitutions')
    .select('timetable_id')
    .eq('substitute_teacher_id', teacherId)

  if (!subs || subs.length < AUTO_PREFERRED_THRESHOLD) return false

  const timetableIds = subs.map((s: any) => s.timetable_id)
  const { data: rows } = await supabase
    .from('timetable')
    .select('id')
    .eq('section_id', sectionId)
    .in('id', timetableIds)

  const timesCovered = rows?.length ?? 0
  if (timesCovered < AUTO_PREFERRED_THRESHOLD) return false

  const { data: existing } = await supabase
    .from('preferred_substitutions')
    .select('id, preferred, fulfilled')
    .eq('teacher_id', teacherId)
    .eq('section_id', sectionId)
    .maybeSingle()

  // Already an active preference for this section — nothing new to do.
  if (existing && existing.preferred && !existing.fulfilled) return false

  await supabase
    .from('preferred_substitutions')
    .upsert(
      { teacher_id: teacherId, section_id: sectionId, preferred: true, fulfilled: false },
      { onConflict: 'teacher_id,section_id' }
    )

  return true
}
