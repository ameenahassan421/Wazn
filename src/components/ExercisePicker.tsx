import { useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseUsageRow } from '@wazn/core/types'
import {
  NO_FILTER,
  applyFilter,
  describeFilter,
  filterActive,
  filterOptions,
} from '@wazn/core/exercise-filter'
import type { ExerciseFilter } from '@wazn/core/exercise-filter'
import { ExerciseThumb } from './ExerciseThumb'
import { IconBack } from './icons'
import { NewExercise } from './NewExercise'
import { useLocale } from '../lib/locale-context'

/**
 * Recently used first, then most used, then everything else alphabetically.
 * Search filters the full catalogue, with name-prefix matches on top.
 */
function orderExercises(
  exercises: Exercise[],
  usage: Map<string, ExerciseUsageRow>,
): Exercise[] {
  /*
   * Archived exercises leave the picker and nowhere else (migration 0024).
   *
   * Filtered here rather than in RLS on purpose: an archived exercise must stay
   * readable, because History has to name the lift a past set was performed
   * against. Hiding it at the database would blank the exercise name on every
   * old workout that used one, which is the opposite of what "archive rather
   * than delete" promises.
   *
   * `!archived_at` covers both null and absent, so this is inert until 0024 is
   * applied rather than filtering on a field that is not there.
   */
  return [...exercises]
    .filter((e) => !e.archived_at)
    .sort((a, b) => {
      const ua = usage.get(a.id)
      const ub = usage.get(b.id)
      if (ua && ub) {
        const byRecency =
          new Date(ub.last_used ?? 0).getTime() - new Date(ua.last_used ?? 0).getTime()
        if (byRecency !== 0) return byRecency
        if (ub.set_count !== ua.set_count) return ub.set_count - ua.set_count
      } else if (ua) {
        return -1
      } else if (ub) {
        return 1
      }
      return a.name.localeCompare(b.name)
    })
}

/**
 * One dimension of the filter, as a row that scrolls sideways.
 *
 * Bleeds to the screen edge — the negative inline margin cancels the app
 * shell's gutter — so a row that continues past the fold looks like it
 * continues, rather than stopping at an invisible wall. No visible heading:
 * muscle names and equipment names are self-describing, the labels are
 * carried for screen readers, and two 13px headings would cost more of the
 * list than they explain.
 */
function ChipScroller({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string | null
  onChange: (next: string | null) => void
}) {
  if (options.length === 0) return null
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px]"
      style={{ scrollbarWidth: 'none' }}
    >
      {options.map((option) => {
        const on = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            // Tapping the chosen chip clears it: the fastest way out of a
            // filter is the control that put you in it.
            onClick={() => onChange(on ? null : option)}
            className={`btn-base h-12 shrink-0 px-3.5 text-body capitalize ${
              on ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function ExercisePicker({
  exercises,
  usage,
  onPick,
  onCancel,
  onCreated,
}: {
  exercises: Exercise[]
  usage: Map<string, ExerciseUsageRow>
  onPick: (exercise: Exercise) => void
  onCancel: () => void
  /** Adds the new exercise to the caller's catalogue. Omit to hide the
   *  create affordance — Progress, for instance, is a reading surface. */
  onCreated?: (exercise: Exercise) => void
}) {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ordered = useMemo(() => orderExercises(exercises, usage), [exercises, usage])
  const options = useMemo(() => filterOptions(exercises), [exercises])

  const results = useMemo(() => {
    // Filter first, then search. The other order would rank a name match the
    // filter is about to throw away.
    const pool = applyFilter(ordered, filter)
    const q = query.trim().toLowerCase()
    if (!q) return pool
    const matches = pool.filter((e) => e.name.toLowerCase().includes(q))
    return matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return ordered.indexOf(a) - ordered.indexOf(b)
    })
  }, [ordered, filter, query])

  const filtered = filterActive(filter)

  if (creating && onCreated) {
    return (
      <NewExercise
        initialName={query.trim()}
        onCancel={() => setCreating(false)}
        onCreated={(exercise) => {
          setCreating(false)
          // Straight into logging it. Somebody who just typed a name and two
          // categories wanted to log a set, not to admire a catalogue entry.
          onCreated(exercise)
          onPick(exercise)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex items-center gap-1 border-b border-line bg-ink py-3">
        {/* A real back control where every phone puts one, not a "Cancel"
            hidden past the keyboard's reach at the end of the row. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('picker.back')}
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('picker.search')}
          // A placeholder is a hint, not a name: it is not exposed as one,
          // and it disappears the moment there is a value. This is the
          // primary control of the screen every workout passes through.
          aria-label={t('picker.search')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 text-start field-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {/* Below the sticky block on purpose. The search bar is the fast path
          and stays put; the filters are the fallback for "find me something I
          have not done", and they should scroll out of the way once you are
          reading the list. */}
      <div className="flex flex-col gap-1.5 pt-2.5">
        <ChipScroller
          label={t('picker.filter.muscle')}
          options={options.muscleGroups}
          value={filter.muscleGroup}
          onChange={(next) => setFilter((f) => ({ ...f, muscleGroup: next }))}
        />
        <ChipScroller
          label={t('picker.filter.equipment')}
          options={options.equipment}
          value={filter.equipment}
          onChange={(next) => setFilter((f) => ({ ...f, equipment: next }))}
        />
      </div>

      {filtered && (
        <div className="flex items-center gap-2 pt-2">
          {/* `ordered`, not `exercises`: the denominator has to be what could
              be shown, and archived rows never can be. "12 of 14" while two of
              the fourteen are archived is a count that cannot be reached. */}
          <span className="tnum flex-1 font-mono text-meta text-muted">
            {results.length} of {ordered.length}
          </span>
          <button
            type="button"
            onClick={() => setFilter(NO_FILTER)}
            className="btn-base btn-quiet h-12 px-2 text-label"
          >
            {t('picker.clear')}
          </button>
        </div>
      )}

      {results.length === 0 ? (
        <div className="py-6">
          <p className="text-body text-muted">
            {filtered
              ? query.trim()
                ? `Nothing matching “${query.trim()}” in ${describeFilter(filter)}.`
                : `No ${describeFilter(filter)} exercise in your catalogue.`
              : `No exercise matches “${query.trim()}”. Check the spelling — the catalogue uses names like “Bench Press (Barbell)”.`}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => setFilter(NO_FILTER)}
              className="btn-base btn-secondary mt-3 h-12 w-full text-body"
            >
              {t('picker.clear')}
            </button>
          )}
          {/* The moment the gap is felt is the moment to offer the fix: a
              search that found nothing already IS the name of the thing. */}
          {onCreated && query.trim() !== '' && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-base btn-hero mt-3 h-[60px] w-full btn-text"
            >
              Add “{query.trim()}”
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex min-h-[76px] w-full items-center gap-3 py-1.5 text-start"
              >
                <ExerciseThumb exercise={exercise} size={64} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate row-title font-medium">
                    {exercise.name}
                  </span>
                  <span className="mt-0.5 block text-label text-muted">
                    {exercise.muscle_group} · {exercise.equipment}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {onCreated && (
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-14 w-full items-center py-3 text-start text-body text-accent-300"
              >
                + New exercise
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
