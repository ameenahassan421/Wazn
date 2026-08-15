import { useLocale } from '../lib/locale-context'

/**
 * The Today brief — design v3.0 §01, the flip-ground block on the home screen.
 *
 * v2.2's dashed "Up next" card gains a coach line and becomes this: routine
 * name, one sentence of reasoning, one chip, and the CTA. It replaces
 * `UpNextCard`, which said the same thing without the reasoning.
 *
 * ── IT IS NEVER A GATE ──────────────────────────────────────────────────────
 * "One tap starts the workout exactly as today; the brief is never a gate."
 * So the CTA is unconditional — it does not wait for a coach line, does not
 * disable itself while one is loading, and renders identically when there is
 * nothing to say. The sentence and the chip are an upgrade to a card that
 * already works, the same two-stage draw `CoachBrief` uses, and for the same
 * reason: nothing may stand between a lifter and Start.
 *
 * ── NO CHIP, NO CLAIM ───────────────────────────────────────────────────────
 * `line` and `chip` are rendered as a pair or not at all. A sentence without
 * its figures is exactly the unanchored claim the doctrine forbids, and the
 * pairing is enforced here rather than trusted to five call sites.
 */
export function TodayBrief({
  title,
  line,
  chip,
  busy,
  onStart,
  onStartEmpty,
}: {
  /** The routine's name, or the app's fallback. Always present. */
  title: string
  /** The coach's one sentence. Absent renders no sentence and no chip. */
  line?: string | null
  chip?: string | null
  busy?: boolean
  onStart: () => void
  /** The quiet way past the plan. Absent hides the link entirely. */
  onStartEmpty?: () => void
}) {
  const { t } = useLocale()
  const speaks = Boolean(line && chip)

  return (
    <section
      aria-label={t('today.label')}
      className="flex flex-col gap-3 p-5"
      style={{
        background: 'var(--flip-bg)',
        color: 'var(--flip-text)',
        borderRadius: 'var(--radius-panel)',
      }}
    >
      <p className="kicker" style={{ color: 'var(--color-accent-700)' }}>
        {t('today.kicker')}
      </p>

      <h2
        dir="auto"
        className="font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.01em]"
      >
        {title}
      </h2>

      {speaks && (
        <>
          {/* Keyed on the text so a sentence arriving after the SQL skeleton
              settles in rather than swapping under the reader's eye — the same
              `coach-in` treatment CoachBrief uses, and the only motion here. */}
          <p
            key={line}
            className="coach-in text-[13px] leading-[1.55]"
            style={{ color: 'color-mix(in srgb, var(--flip-text) 66%, transparent)' }}
          >
            {line}
          </p>
          <span
            dir="ltr"
            className="chip-data tnum self-start"
            style={{
              backgroundColor: 'rgba(232, 73, 29, 0.14)',
              color: 'var(--color-accent-700)',
            }}
          >
            {chip}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="press font-display flex h-[52px] w-full items-center justify-center text-[17px] font-semibold disabled:opacity-45"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-accent-ink)',
          borderRadius: 12,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        }}
      >
        {busy ? t('routines.starting') : t('today.start', { name: title })}
      </button>

      {onStartEmpty && (
        <button
          type="button"
          onClick={onStartEmpty}
          disabled={busy}
          // 48px of target under a 12px label. The design draws the link at
          // its text height; the floor is not negotiable, so the target grows
          // and the type stays where it was drawn.
          className="press -my-2 flex h-12 items-center justify-center self-center text-[12px] disabled:opacity-45"
          style={{ color: 'color-mix(in srgb, var(--flip-text) 45%, transparent)' }}
        >
          {t('today.start_empty')}
        </button>
      )}
    </section>
  )
}
