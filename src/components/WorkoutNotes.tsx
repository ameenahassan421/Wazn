import { useId, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useLocale } from '../lib/locale-context'

/**
 * Name and note for one workout.
 *
 * One component, two homes: the finish summary — the one screen in the app
 * where the user has attention to spend (§2.1 keeps everything else clear of
 * it) — and the History expansion, where the same fields correct the record
 * weeks later. One editor grammar, two moments, per the UX heuristics: two
 * divergent editors for one pair of fields would double the bugs and halve
 * the muscle memory.
 *
 * `workouts.name` has existed since 0001 and `workouts.notes` since 0008.
 * Neither has ever had a writer outside the routine that stamps a name at
 * start — the column was added and then nothing read it, which is the same
 * class of dead code the U1 charts were.
 *
 * Saved on blur rather than behind a button, matching the exercise note on
 * the detail page. A save button on a field nobody is required to fill is one
 * more thing to tap before leaving the gym.
 */
export function WorkoutNotes({
  workoutId,
  initialName,
  initialNote,
  onSaved,
}: {
  workoutId: string
  initialName: string | null
  initialNote: string | null
  /** Lets the caller patch its own copy, so a list row updates in place. */
  onSaved?: (values: { name: string | null; notes: string | null }) => void
}) {
  const { t } = useLocale()
  const id = useId()
  const [name, setName] = useState(initialName ?? '')
  const [note, setNote] = useState(initialNote ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(patch: { name?: string; notes?: string }) {
    const next = {
      name: (patch.name ?? name).trim() || null,
      notes: (patch.notes ?? note).trim() || null,
    }
    // Nothing changed: blur fires on every tab-away, and a write per blur
    // would be a round trip for looking at a field.
    if (next.name === (initialName ?? null) && next.notes === (initialNote ?? null)) {
      return
    }

    setSaving(true)
    const { error } = await supabase.from('workouts').update(next).eq('id', workoutId)
    setSaving(false)
    if (error) {
      setStatus(describeError(t('notes.error.save'), error))
      return
    }
    setStatus(null)
    onSaved?.(next)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <label htmlFor={`${id}-name`} className="kicker mb-1 block">
          {t('notes.name')}
        </label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => void save({ name: e.target.value })}
          placeholder={t('notes.name.placeholder')}
          className="ring-edge h-12 w-full bg-surface px-3 text-start text-base outline-none placeholder:text-muted focus:border-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
      </div>

      <div>
        <label htmlFor={`${id}-note`} className="kicker mb-1 block">
          {t('notes.note')}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          rows={2}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          onBlur={(e) => void save({ notes: e.target.value })}
          placeholder={t('notes.note.placeholder')}
          className="ring-edge w-full resize-y bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
      </div>

      <p
        className={`text-[11px] ${status ? 'text-accent' : 'text-muted'}`}
        role="status"
      >
        {status ?? (saving ? t('notes.saving') : t('notes.saved'))}
      </p>
    </div>
  )
}
