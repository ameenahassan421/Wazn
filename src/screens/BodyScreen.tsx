import { useEffect, useState } from 'react'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { useCoach } from '../lib/coach-context'
import { showsCoachSurfaces } from '../lib/coach-mode'
import { formatWeight, formatWeightWithUnit, fromDisplayWeight } from '../lib/units'
import { SeriesChart } from '../components/SeriesChart'
import { CoachLine } from '../components/CoachLine'
import {
  crossSignal,
  latestWeightKg,
  measurementRows,
  proteinWeek,
  weightSeries,
} from '../lib/body'
import {
  fetchBodyOverview,
  logProtein,
  logWeighIn,
  type BodyOverview,
} from '../lib/body-store'
import { supabase } from '../lib/supabase'

/**
 * Body — design v3.0 §13, the second dataset.
 *
 * What training moves besides the bar: a weight trend, the week's protein, the
 * measurements, and one coach line reading the cross-signal between weight and
 * strength. Four series, one round trip (`body_overview`, migration 0027).
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * Calories and macros beyond protein: the spec's own overrule, and the reason
 * is in `lib/body.ts`. Raw biometrics: sleep and HRV feed `readiness.ts` and
 * appear here as one mono footer line, because Wazn is not Whoop and the score
 * is an input rather than a product.
 *
 * **Progress photos are not built and this screen does not draw their row.**
 * The design lists `Progress photos · PRIVATE · 6`, and the spec's contract
 * for them — camera-only, never uploaded, never seen by the model, side-by-side
 * compare with a date scrubber — is a surface of its own, not a list row. A row
 * reading `PRIVATE · 0` above a control that opens nothing is exactly what
 * SettingsScreen refuses to do with the four rows it also leaves out. It is
 * named as unbuilt in DECISIONS.md rather than half-drawn here.
 *
 * ── THE EMPTY STATE IS THE COMMON STATE ─────────────────────────────────────
 * Until 0027 is applied, and for every lifter who has never weighed in, this
 * screen has nothing. "Log a weigh-in to start the second chart." — one
 * sentence, one control, and no nagging for the other three datasets.
 */
export function BodyScreen() {
  const { t, locale } = useLocale()
  const { unit } = useUnit()
  const { volume, proteinTargetG, setProteinTargetG } = useCoach()
  const [body, setBody] = useState<BodyOverview | null>(null)
  const [strengthGainKg, setStrengthGainKg] = useState<number | null>(null)
  const [logging, setLogging] = useState<'weight' | 'protein' | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const overview = await fetchBodyOverview()
      if (active) setBody(overview)
    })()
    return () => {
      active = false
    }
  }, [])

  /**
   * The strength half of the cross-signal.
   *
   * `exercise_bests` is already the app's answer to "what has moved lately",
   * and reusing it means the Body tab's claim and the Progress tab's list
   * cannot disagree about the same lift. A failure answers null, which means
   * the coach line simply does not render — half a cross-signal is not one.
   */
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('exercise_bests')
        if (!active || error || !Array.isArray(data)) return
        let best = 0
        for (const row of data as {
          recent_e1rm_kg?: unknown
          previous_e1rm_kg?: unknown
        }[]) {
          const now = Number(row.recent_e1rm_kg ?? 0)
          const before = Number(row.previous_e1rm_kg ?? 0)
          if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) continue
          if (now - before > best) best = now - before
        }
        setStrengthGainKg(best > 0 ? Number(best.toFixed(1)) : null)
      } catch {
        // The Body tab is a dashboard, not a report. A failed read is one
        // fewer card, never a message.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const weights = body?.weights ?? []
  const series = weightSeries(weights)
  const latest = latestWeightKg(weights)
  const speaks = showsCoachSurfaces(volume)
  const signal = speaks ? crossSignal(weights, strengthGainKg) : null
  const bars = proteinWeek(body?.protein ?? [], { target: proteinTargetG })
  const measurements = measurementRows(body?.measurements ?? [])

  async function save() {
    const value = Number.parseFloat(draft.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    if (logging === 'weight') {
      await logWeighIn(fromDisplayWeight(value, unit))
    } else {
      // A target set here is remembered, so tomorrow's bar has a line to
      // measure against without asking again.
      const target = proteinTargetG ?? Math.round(value)
      if (proteinTargetG === null) setProteinTargetG(target)
      await logProtein(Math.round(value), target)
    }
    setDraft('')
    setLogging(null)
    setBody(await fetchBodyOverview())
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-title font-extrabold tracking-[-0.02em]">
          {t('nav.body')}
        </h1>
        <button
          type="button"
          onClick={() => {
            setLogging((open) => (open === 'weight' ? null : 'weight'))
            setDraft('')
          }}
          className="meta-mono h-12 px-2.5 text-label text-accent-300"
        >
          <span
            className="grid h-[30px] place-items-center px-2.5"
            style={{
              border: '1px solid var(--color-line)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {t('body.log_weigh_in')}
          </span>
        </button>
      </div>

      {logging && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label htmlFor="body-value" className="sr-only">
            {logging === 'weight' ? t('body.log_weigh_in') : t('body.log_protein')}
          </label>
          <input
            id="body-value"
            type="number"
            inputMode="decimal"
            step="0.1"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={logging === 'weight' ? unit : 'g'}
            className="tnum h-12 min-w-0 flex-1 border border-line bg-surface px-3 field-text outline-none focus:border-accent"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <button
            type="submit"
            className="btn-base btn-hero h-12 shrink-0 px-4 text-body"
          >
            {t('body.save')}
          </button>
        </form>
      )}

      {/* The cross-signal. `CoachLine` renders nothing without its chip, so a
          lifter with weigh-ins but no strength movement sees no card at all
          rather than a sentence with no evidence behind it. */}
      {signal && (
        <section
          className="p-4"
          style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <CoachLine
            line={t(`body.signal.${signal.kind}`, { weeks: String(signal.weeks) })}
            chip={t('body.signal.chip', {
              bw: formatWeight(signal.averageKg, unit),
              unit,
              gain: formatWeight(Math.abs(signal.strengthGainKg), unit),
              arrow: signal.strengthGainKg > 0 ? '▲' : '▼',
            })}
          />
        </section>
      )}

      {series.length === 0 ? (
        <section
          className="flex flex-col items-start gap-3 p-4"
          style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <p className="text-body leading-[1.5] text-muted">{t('body.empty')}</p>
        </section>
      ) : (
        <section
          className="flex flex-col gap-2 p-4"
          style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="kicker">{t('body.weight')}</h2>
            <span dir="ltr" className="font-display tnum text-num font-medium">
              {formatWeightWithUnit(latest, unit)}
            </span>
          </div>
          <SeriesChart
            values={series.map((p) => p.kg)}
            baseline="data"
            height={64}
            ariaLabel={t('body.weight.aria')}
          />
        </section>
      )}

      {/* Protein — the only nutrition number in v3. */}
      <section
        className="flex flex-col gap-2.5 p-4"
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-panel)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="kicker">{t('body.protein')}</h2>
          <button
            type="button"
            onClick={() => {
              setLogging((open) => (open === 'protein' ? null : 'protein'))
              setDraft('')
            }}
            className="meta-mono h-12 text-label text-accent-300"
          >
            {proteinTargetG === null
              ? t('body.protein.set_target')
              : t('body.protein.target', { g: String(proteinTargetG) })}
          </button>
        </div>

        {/* A week with nothing in it gets a sentence, not seven stubs under
            56px of white. The design's card is drawn with six logged days;
            an all-empty one is a different state and drawing the chart anyway
            reads as a rendering fault rather than as an empty week. */}
        {bars.every((bar) => bar.state === 'empty') ? (
          <p className="text-body leading-[1.5] text-muted">
            {t('body.protein.empty')}
          </p>
        ) : (
          <>
            <div className="flex h-14 items-end gap-2">
              {bars.map((bar) => (
                <span
                  key={bar.date.toISOString()}
                  className="block flex-1"
                  style={{
                    // A day nobody logged is a stub, not a zero — an unlogged day
                    // is not a day somebody ate nothing (doctrine 3).
                    height:
                      bar.state === 'empty'
                        ? '10%'
                        : `${Math.max(8, bar.fraction * 100)}%`,
                    borderRadius: 'var(--radius-bar) var(--radius-bar) 0 0',
                    background:
                      bar.state === 'met'
                        ? 'var(--color-accent)'
                        : bar.state === 'under'
                          ? 'var(--color-tile-4)'
                          : 'var(--color-tile-1)',
                  }}
                />
              ))}
            </div>
            <div
              className="meta-mono flex justify-between text-nano"
              style={{ color: 'var(--ghost-ink)' }}
            >
              {bars.map((bar) => (
                <span key={bar.date.toISOString()} className="flex-1 text-center">
                  {narrowDay(bar.date, locale)}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {measurements.length > 0 && (
        <ul
          className="overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {measurements.map((row, i) => (
            <li
              key={row.site}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={
                i === 0 ? undefined : { borderTop: '1px solid var(--divider-solid)' }
              }
            >
              <span className="row-title font-semibold">
                {t(`body.site.${row.site}`)}
              </span>
              <span dir="ltr" className="meta-mono tnum text-meta">
                {row.cm} cm{' '}
                {row.deltaCm === null || row.deltaCm === 0 ? (
                  <span className="text-muted">→</span>
                ) : (
                  <span className="text-accent-300">
                    {row.deltaCm > 0 ? '▲' : '▼'} {Math.abs(row.deltaCm)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Raw biometrics never get their own surface. One line, and it says
          what they are FOR rather than what they were.

          `kicker` rather than a hand-set 10px: mono, tracked and uppercase is
          exactly what that utility is, and the handoff's own token map sends
          "IBM Plex Mono 10–11px" to it. */}
      <p className="kicker text-center" style={{ color: 'var(--ghost-ink)' }}>
        {t('body.footer')}
      </p>
    </div>
  )
}

/** `M T W T F S S`, in the app's locale. Sunday-safe: index, not name. */
function narrowDay(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(date)
  }
}
