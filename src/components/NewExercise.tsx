import { useState } from 'react'
import { createCustomExercise } from '../lib/exercises'
import type { Exercise, MuscleGroup } from '@wazn/core/types'
import { IconBack } from './icons'
import { ExerciseFields } from './ExerciseFields'
import { useLocale } from '../lib/locale-context'

/**
 * Add an exercise the catalogue does not have.
 *
 * Two fields and a name, because this is opened mid-search by someone who
 * wanted to log a set thirty seconds ago. Muscle group and equipment are the
 * only two the rest of the app actually consumes — the picker groups by them,
 * the balance chart counts by muscle group, and the routine generator filters
 * by equipment — so asking for anything else would be collecting it for its
 * own sake.
 *
 * The name is prefilled from whatever was typed into the search box. That is
 * the whole reason this lives in the picker: the search that found nothing is
 * already the name of the thing.
 */
export function NewExercise({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string
  onCreated: (exercise: Exercise) => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const [name, setName] = useState(initialName)
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState<string>('machine')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await createCustomExercise({ name, muscleGroup, equipment }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('exercise.new.error'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('exercise.new.back')}
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack size={20} />
        </button>
        <h2 className="flex-1 text-title font-medium">{t('exercise.new.title')}</h2>
      </div>

      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-body text-accent-300"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <ExerciseFields
        idPrefix="new-exercise"
        name={name}
        muscleGroup={muscleGroup}
        equipment={equipment}
        onName={setName}
        onMuscleGroup={setMuscleGroup}
        onEquipment={setEquipment}
        nameHint="Only you can see this one. The catalogue names lifts like “Bench Press (Barbell)” — matching that makes it easier to find later."
      />

      {/* The one hero: it is the only thing this screen exists to do. */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || name.trim().length < 2}
        className="btn-base btn-hero h-[60px] w-full btn-text disabled:opacity-45"
      >
        {busy ? t('exercise.new.adding') : t('exercise.new.add')}
      </button>
    </div>
  )
}
