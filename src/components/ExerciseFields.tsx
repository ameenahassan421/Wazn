import { EQUIPMENT, MUSCLE_GROUPS } from '../lib/exercises'
import type { MuscleGroup } from '@wazn/core/types'
import { useLocale } from '../lib/locale-context'

/**
 * The three things a custom exercise is: a name, a muscle group, an equipment
 * kind. Shared by the create flow in the picker and the edit flow on the lift's
 * own page.
 *
 * Extracted rather than copied, because the field list is not cosmetic: the
 * muscle group is what puts a lift on the weekly-sets chart and the equipment
 * is what the routine generator filters by. Two copies of this form would
 * eventually offer different fields, and the one that drifted would be writing
 * rows the rest of the app reads differently.
 */
export function ExerciseFields({
  name,
  muscleGroup,
  equipment,
  onName,
  onMuscleGroup,
  onEquipment,
  idPrefix,
  nameHint,
}: {
  name: string
  muscleGroup: MuscleGroup
  equipment: string
  onName: (value: string) => void
  onMuscleGroup: (value: MuscleGroup) => void
  onEquipment: (value: string) => void
  /** Two of these can be mounted in one app; ids have to stay unique. */
  idPrefix: string
  nameHint?: string
}) {
  const { t } = useLocale()
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className="kicker mb-2 block">
          {t('exercise.name')}
        </label>
        <input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('exercise.new.name.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          className="ring-edge h-14 w-full bg-surface px-3 field-text outline-none focus:border-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        {nameHint && <p className="mt-1 text-label text-muted">{nameHint}</p>}
      </div>

      <fieldset>
        <legend className="kicker mb-2">{t('exercise.new.muscle')}</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={muscleGroup === g}
              onClick={() => onMuscleGroup(g)}
              className={`btn-base h-12 px-3.5 text-body capitalize ${
                muscleGroup === g ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="mt-1 text-label text-muted">{t('exercise.muscle_hint')}</p>
      </fieldset>

      <fieldset>
        <legend className="kicker mb-2">{t('exercise.new.equipment')}</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={equipment === e}
              onClick={() => onEquipment(e)}
              className={`btn-base h-12 px-3.5 text-body capitalize ${
                equipment === e ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  )
}
