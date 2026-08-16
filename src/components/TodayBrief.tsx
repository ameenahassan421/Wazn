import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { formatVolume, partOfDay } from '../lib/format'

const PART_OF_DAY_KEY: Record<ReturnType<typeof partOfDay>, string> = {
  morning: 'today.morning',
  afternoon: 'today.afternoon',
  evening: 'today.evening',
}

/**
 * The hunt card — v5 "Momentum" screen 06, the home screen's one hero.
 *
 * ── WHAT CHANGED FROM v3, AND WHY IT IS NOT A RESTYLE ───────────────────────
 * v3's Today brief made the ROUTINE NAME the headline. v5 makes the headline
 * the thing you are here to do: `BEAT {last session's volume}`, with the
 * routine name demoted to the kicker beside the time of day. That is the
 * whole idea of the screen — you do not open the app to read what today is
 * called, you open it to beat something — so the card is rebuilt rather than
 * recoloured.
 *
 * It also stops being a flip surface. Under the paper theme `--flip-bg` drew
 * a dark card on a light screen; after v5's palette inversion the same token
 * drew a CREAM slab on iron, which made the quietest card on the reference
 * screen the loudest thing in the app. v5 draws it as an ordinary card on
 * `surface` with a hairline ring, and that is what it is now.
 *
 * ── THE TARGET IS THE LAST SESSION, NOT THE LAST TIME YOU DID THIS ──────────
 * `targetKg` is the previous session's volume whatever routine it was, which
 * is what v5's own `C2.lastVolume()` returns. Scoping it to the same routine
 * would be a better number and needs a query this card does not have; the
 * caveat is logged in DECISIONS.md rather than hidden behind a confident
 * headline. When there is no previous session the card falls back to v3's
 * behaviour and leads with the routine name, because "BEAT 0" is not a goal.
 *
 * ── IT IS NEVER A GATE ──────────────────────────────────────────────────────
 * "One tap starts the workout exactly as today; the brief is never a gate."
 * So the CTA is unconditional — it does not wait for a coach line, does not
 * disable itself while one is loading, and renders identically when there is
 * nothing to say.
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
  targetKg,
  busy,
  onStart,
  onStartEmpty,
}: {
  /** The routine's name, or the app's fallback. Always present. */
  title: string
  /** The coach's one sentence. Absent renders no sentence and no chip. */
  line?: string | null
  chip?: string | null
  /**
   * The previous session's total volume in kg — the number to beat. Null or
   * zero on a first workout, which falls the headline back to the name.
   */
  targetKg?: number | null
  busy?: boolean
  onStart: () => void
  /** The quiet way past the plan. Absent hides the link entirely. */
  onStartEmpty?: () => void
}) {
  const { t, locale } = useLocale()
  const { unit } = useUnit()
  const speaks = Boolean(line && chip)
  const hunting = Boolean(targetKg && targetKg > 0)

  return (
    <section
      aria-label={t('today.label')}
      className="ring-edge bg-surface flex flex-col gap-3 px-[18px] py-5"
      style={{ borderRadius: 'var(--radius-panel)' }}
    >
      {/* Not an eyebrow: it carries the two facts the headline drops — which
          plan today is, and that "today" means tonight. */}
      <p className="kicker" style={{ color: 'var(--color-accent-300)' }}>
        {t(PART_OF_DAY_KEY[partOfDay(new Date())])} · {title}
      </p>

      {/* The heading follows the document direction — the verb is a translated
          word — and only the figure is pinned LTR. Wrapping the whole h2 in
          `dir="ltr"` would push the Arabic verb to the wrong side of its own
          line to buy nothing. */}
      {hunting ? (
        <h2 className="font-display tnum text-hero my-0.5 uppercase">
          {t('today.beat')}
          <br />
          <span dir="ltr">
            {formatVolume(targetKg ?? 0, unit, locale)}
            {/* Absolute, not proportional: v5 pairs the same 22px suffix with
                a 50px figure and with a 66px one. `num` is that step. */}
            <span className="text-num text-muted"> {unit}</span>
          </span>
        </h2>
      ) : (
        <h2
          dir="auto"
          className="font-display text-fig leading-[1.15] font-semibold tracking-[-0.01em]"
        >
          {title}
        </h2>
      )}

      {speaks && (
        <>
          {/* Keyed on the text so a sentence arriving after the SQL skeleton
              settles in rather than swapping under the reader's eye — the same
              `coach-in` treatment CoachBrief uses, and the only motion here. */}
          <p key={line} className="coach-in text-body text-muted leading-[1.55]">
            {line}
          </p>
          <span dir="ltr" className="chip-data tnum self-start">
            {chip}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="press btn-hero font-display btn-text flex h-14 w-full items-center justify-center font-semibold uppercase disabled:opacity-45"
        style={{ borderRadius: 'var(--radius-ctl)' }}
      >
        {busy ? t('routines.starting') : t('today.start_hunt')}
      </button>

      {onStartEmpty && (
        <button
          type="button"
          onClick={onStartEmpty}
          disabled={busy}
          // 48px of target under a 13px label. The design draws the link at
          // its text height; the floor is not negotiable, so the target grows
          // and the type stays where it was drawn.
          className="press text-label text-muted -my-2 flex h-12 items-center justify-center self-center disabled:opacity-45"
        >
          {t('today.start_empty')}
        </button>
      )}
    </section>
  )
}
