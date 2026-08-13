import type { OverviewBlock } from './WorkoutOverview'
import { PlateCheck, PlateHollow, PlateRing } from './icons'
import { useLocale } from '../lib/locale-context'

/**
 * The session queue: the rest of the board, one row deep, under the lift you
 * are on.
 *
 * The overview is the ledger — every exercise and every row, editable and
 * reorderable. This is the map: where you are in the session and what is
 * left, without leaving the set you are about to log. It reads from the same
 * `blocks` the overview draws, so the two can never disagree about what is
 * done.
 *
 * Rows are 48px, not the design's 32px: every one of them is a jump control
 * (consequences ledger row 3 — the design's sub-48px chips are raised, and
 * thumb law wins).
 */
export function SessionQueue({
  blocks,
  currentExerciseId,
  onJump,
}: {
  blocks: OverviewBlock[]
  currentExerciseId: string
  onJump: (exerciseId: string) => void
}) {
  const { t } = useLocale()
  if (blocks.length < 2) return null

  const done = (b: OverviewBlock) => b.committed >= b.planned && b.planned > 0
  const remaining = blocks.filter(
    (b) => b.exerciseId !== currentExerciseId && !done(b),
  ).length

  return (
    <div className="surface-panel flex flex-col gap-0.5 px-4 py-3">
      {/* The `kicker` utility rather than the recipe by hand: it carries the
          RTL reset, and tracking out Arabic breaks the letter joins. */}
      <p className="kicker mb-1">
        {t('queue.kicker')} · {t('queue.to_go', { n: String(remaining) })}
      </p>

      {blocks.map((block) => {
        const current = block.exerciseId === currentExerciseId
        const complete = done(block)
        const name = block.exercise?.name ?? t('overview.exercise_fallback')

        // The scheme a lift is walking into. `planned` carries the app's whole
        // precedence ladder (routine target → last session → one), and the
        // ghost row carries the reps that go with it. A lift with neither a
        // routine nor a history has no honest scheme, and gets a dash.
        const ghostReps = block.rows.find((r) => r.kind === 'ghost')?.reps ?? null
        const detail = current
          ? t('queue.sets_short', {
              a: String(block.committed),
              b: String(block.planned),
            })
          : complete
            ? t('overview.logged')
            : ghostReps === null
              ? '—'
              : t('queue.scheme', {
                  sets: String(block.planned),
                  reps: String(ghostReps),
                })

        return (
          <button
            key={block.exerciseId}
            type="button"
            onClick={() => onJump(block.exerciseId)}
            aria-current={current ? 'true' : undefined}
            // The label carries the detail as well as the destination: an
            // aria-label replaces the row's content, and "2/4 sets" is the
            // half of the row worth hearing.
            aria-label={`${t('queue.jump', { name })} — ${detail}`}
            className="flex min-h-12 w-full items-center gap-2.5 text-start"
          >
            {current ? (
              <PlateRing size={16} className="shrink-0 text-accent" />
            ) : complete ? (
              <PlateCheck size={16} className="shrink-0" />
            ) : (
              <PlateHollow size={16} className="shrink-0 text-muted" />
            )}
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${
                current ? 'font-semibold' : 'text-muted'
              }`}
            >
              {name}
            </span>
            {/* Latin figures beside an Arabic name: isolated, or the bidi
                algorithm reorders "3 × 5" against the words next to it. The
                done row's detail is a translated word, not a figure, and
                must NOT be forced left-to-right. */}
            <span
              dir={complete ? undefined : 'ltr'}
              className="meta-mono tnum shrink-0 text-xs text-muted"
            >
              {detail}
            </span>
          </button>
        )
      })}
    </div>
  )
}
