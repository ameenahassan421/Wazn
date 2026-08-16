import { useLocale } from '../lib/locale-context'

/**
 * WEEK · STREAK · FREEZE — design v3.0 §01's three tiles.
 *
 * Three facts, one glance, no navigation. They replace the two-up
 * week/record row that carried the doors to History and Progress before the
 * tab bar came back; those doors now live in the bar, and these tiles say
 * something the bar cannot.
 *
 * ── WHY FREEZE IS ON THE HOME SCREEN ────────────────────────────────────────
 * A streak with hidden protection is still a streak that threatens you. The
 * research finding the spec cites is that streaks without protection create
 * anxiety and churn — so the protection is visible before it is needed, not
 * announced after it is spent. `2` is not a reward to spend; it is the app
 * saying "two bad weeks this month are already covered".
 */

export interface Tile {
  key: string
  labelKey: string
  /** Already formatted — `2 / 3`, `9 wk`, `2`. Figures stay Latin (§RTL). */
  value: string
}

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const { t } = useLocale()
  if (tiles.length === 0) return null

  return (
    <ul className="flex gap-2.5">
      {tiles.map((tile) => (
        <li
          key={tile.key}
          className="surface-card flex flex-1 flex-col gap-0.5 px-3.5 py-3"
          style={{ borderRadius: 'var(--radius-lg)' }}
        >
          <span className="kicker">{t(tile.labelKey)}</span>
          <span
            dir="ltr"
            className="font-display tnum text-num leading-tight font-semibold"
          >
            {tile.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The next routine, as one row: name, what it holds, when it is due.
 *
 * Deliberately not a second CTA. The Today brief above it is the screen's one
 * hero and §2.4 allows exactly one per screen; this is the answer to "and
 * then what", which is a question you read rather than press.
 */
export function NextRoutineRow({
  name,
  meta,
  when,
  onOpen,
}: {
  name: string
  /** `5 lifts · last 08-08`. Mono, because it is a line of figures. */
  meta: string
  /** `SAT`, or null when the rotation has nothing to say. */
  when: string | null
  onOpen?: () => void
}) {
  const content = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span dir="auto" className="truncate row-title font-semibold">
          {name}
        </span>
        <span dir="ltr" className="meta-mono tnum truncate text-meta text-muted">
          {meta}
        </span>
      </span>
      {when && (
        <span dir="ltr" className="meta-mono shrink-0 text-meta text-muted">
          {when}
        </span>
      )}
    </>
  )

  if (!onOpen) {
    return (
      <div
        className="surface-card flex items-center justify-between gap-3 px-4 py-3.5"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start"
      style={{ borderRadius: 'var(--radius-lg)' }}
    >
      {content}
    </button>
  )
}
