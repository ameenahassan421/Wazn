import { useState } from 'react'
import { EQUIPMENT, MUSCLE_GROUPS, createCustomExercise } from '../lib/exercises'
import type { Exercise, MuscleGroup } from '../lib/types'
import { IconBack } from './icons'

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
      setError(e instanceof Error ? e.message : 'Could not add that exercise.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack size={20} />
        </button>
        <h2 className="flex-1 text-base font-medium">New exercise</h2>
      </div>

      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor="exercise-name" className="kicker mb-2 block">
          Name
        </label>
        <input
          id="exercise-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hack Squat (Machine)"
          autoComplete="off"
          autoCorrect="off"
          className="ring-edge h-14 w-full bg-surface px-3 text-base outline-none focus:border-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        <p className="mt-1 text-[11px] text-muted">
          Only you can see this one. The catalogue names lifts like “Bench Press
          (Barbell)” — matching that makes it easier to find later.
        </p>
      </div>

      <fieldset>
        <legend className="kicker mb-2">Muscle group</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={muscleGroup === g}
              onClick={() => setMuscleGroup(g)}
              className={`btn-base h-12 px-3.5 text-sm capitalize ${
                muscleGroup === g ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          This is what puts it on the weekly-sets chart, so pick the one it actually
          trains.
        </p>
      </fieldset>

      <fieldset>
        <legend className="kicker mb-2">Equipment</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={equipment === e}
              onClick={() => setEquipment(e)}
              className={`btn-base h-12 px-3.5 text-sm capitalize ${
                equipment === e ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      {/* The one hero: it is the only thing this screen exists to do. */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || name.trim().length < 2}
        className="btn-base btn-hero h-[60px] w-full text-[17px] disabled:opacity-45"
      >
        {busy ? 'Adding…' : 'Add and use it'}
      </button>
    </div>
  )
}
