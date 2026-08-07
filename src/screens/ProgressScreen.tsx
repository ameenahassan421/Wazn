import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { formatWeight, toDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import { formatRelativeDay } from '../lib/format'
import type { Exercise } from '../lib/types'
import { ExerciseDetail } from '../components/ExerciseDetail'
import { ExerciseThumb } from '../components/ExerciseThumb'
import { RangeChips } from '../components/RangeChips'
import {
  SET_BAND,
  bandState,
  liftBalance,
  monthlyVolume,
  sessionsPerWeek,
  underBand,
  weeklyVolume,
} from '../lib/progress'
import type {
  BalanceRow as AnchorRow,
  ExerciseBest,
  MuscleGroupSets,
  SessionVolumeRow,
  WeekBucket,
} from '../lib/progress'
import {
  DEFAULT_RANGE,
  describeRange,
  describeSpan,
  volumeSpan,
  withinRange,
} from '../lib/range'
import type { RangeKey, VolumeSpan } from '../lib/range'

/**
 * Progress — design v2.1 screen 02.
 *
 * One scrolling dashboard, not three sub-tabs. The sub-tabs were a reasonable
 * answer when Progress meant "charts"; they are the wrong answer to "how is my
 * training going", because that question is answered by comparing the week's
 * sessions against the balance against the trend — and a tab strip is a
 * machine for hiding two of the three.
 *
 * The muscle-balance chart is the signature: the 10-20 productive band is
 * drawn as a knurl panel on the track, so "in the zone" literally means on
 * the grip.
 */

interface StrengthRow {
  exercise_id: string
  name: string
  muscle_group: string
  image_url: string | null
  last_trained_at: string | null
  best_e1rm_kg: number | string | null
  recent_e1rm_kg: number | string | null
  previous_e1rm_kg: number | string | null
  set_count: number | string
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** The balance track caps here, so one enormous group cannot flatten the rest. */
const SCALE_MAX = 30

/** A quarter of weeks — long enough to show a pattern, short enough that a
 *  bar is still a bar on a phone. Fixed, unlike the two ranged blocks: the
 *  question this answers is "am I showing up lately", and lately is a
 *  quarter. */
const FREQUENCY_WEEKS = 13

export function ProgressScreen({ onOpenCoach }: { onOpenCoach: () => void }) {
  const { unit } = useUnit()

  const [sessions, setSessions] = useState<SessionVolumeRow[]>([])
  const [groups, setGroups] = useState<MuscleGroupSets[]>([])
  const [strength, setStrength] = useState<StrengthRow[]>([])
  const [streak, setStreak] = useState<number>(0)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [detail, setDetail] = useState<Exercise | null>(null)
  useBackLayer(detail !== null, () => setDetail(null))

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Each ranged block keeps its own window: "how much am I lifting lately"
  // and "where is my bench all time" are different questions.
  const [volumeRange, setVolumeRange] = useState<RangeKey>(DEFAULT_RANGE)
  const [strengthRange, setStrengthRange] = useState<RangeKey>(DEFAULT_RANGE)

  useEffect(() => {
    let active = true
    void (async () => {
      const [volume, muscle, lifts, streakRows, catalogue] = await Promise.all([
        supabase.rpc('session_volume_history'),
        supabase.rpc('muscle_group_weekly_sets', { p_days: 7 }),
        supabase.rpc('strength_summary'),
        supabase.rpc('weekly_streak'),
        supabase.from('exercises').select('*').order('name'),
      ])
      if (!active) return

      const failure =
        volume.error ??
        muscle.error ??
        lifts.error ??
        streakRows.error ??
        catalogue.error
      if (failure) {
        setError(describeError('Loading your progress', failure))
        setLoading(false)
        return
      }

      setSessions((volume.data ?? []) as SessionVolumeRow[])
      setGroups((muscle.data ?? []) as MuscleGroupSets[])
      setStrength((lifts.data ?? []) as StrengthRow[])
      setStreak(((streakRows.data ?? []) as { weeks: number }[])[0]?.weeks ?? 0)
      setExercises((catalogue.data ?? []) as Exercise[])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  // `session_volume_history` comes back oldest first, so the first row is the
  // first workout ever — which is how far "All" has to reach.
  const oldest = sessions[0]?.started_at ?? null

  const span = useMemo(() => volumeSpan(volumeRange, oldest), [volumeRange, oldest])

  // Both bucketings produce { start, volumeKg }, so the chart takes one shape
  // and the range decides which function fills it.
  const volumePoints = useMemo(
    () =>
      span.bucket === 'week'
        ? weeklyVolume(sessions, span.count)
        : monthlyVolume(sessions, span.count),
    [sessions, span],
  )

  const frequency = useMemo(
    () => sessionsPerWeek(sessions, FREQUENCY_WEEKS),
    [sessions],
  )

  // The anchor lifts ride the strength RPC rather than a fifth call:
  // `strength_summary` already carries every field `liftBalance` reads.
  const anchors = useMemo(
    () =>
      liftBalance(
        strength
          .filter((row) => row.best_e1rm_kg !== null)
          .map((row): ExerciseBest => ({
            exercise_id: row.exercise_id,
            name: row.name,
            best_e1rm_kg: row.best_e1rm_kg as number | string,
          })),
      ),
    [strength],
  )

  const rangedStrength = useMemo(
    () => strength.filter((row) => withinRange(row.last_trained_at, strengthRange)),
    [strength, strengthRange],
  )

  const thisWeek = useMemo(() => {
    // Monday-start, in the viewer's own timezone — the same boundary the
    // streak uses, so the two figures on the same card cannot disagree.
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const mine = sessions.filter((s) => new Date(s.started_at) >= start)
    return {
      sessions: mine.length,
      volumeKg: mine.reduce((sum, s) => sum + num(s.volume_kg), 0),
    }
  }, [sessions])

  if (loading) return <p className="py-10 text-sm text-muted">Loading…</p>
  if (detail) return <ExerciseDetail exercise={detail} onBack={() => setDetail(null)} />

  const empty = sessions.length === 0 && strength.length === 0

  return (
    <div className="flex flex-col gap-5 py-3">
      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <ThisWeek
        sessions={thisWeek.sessions}
        volumeKg={thisWeek.volumeKg}
        streakWeeks={streak}
        unit={unit}
      />

      <MuscleBalance groups={groups} onOpenCoach={onOpenCoach} empty={empty} />

      {/* Frequency and anchors draw on an empty log; volume and strength do
          not. The difference is whether the empty chart still says something:
          thirteen week slots and four named lifts are the shape of the
          question, the way the muscle-balance band is. An empty line chart
          is just an axis. */}
      <SessionFrequency weeks={frequency} />

      {!empty && (
        <VolumeTrend
          points={volumePoints}
          span={span}
          unit={unit}
          range={volumeRange}
          onRange={setVolumeRange}
        />
      )}

      <AnchorLifts rows={anchors} unit={unit} />

      {!empty && (
        <StrengthList
          rows={rangedStrength}
          total={strength.length}
          unit={unit}
          range={strengthRange}
          onRange={setStrengthRange}
          onOpen={(id) => {
            const found = exercises.find((e) => e.id === id)
            if (found) setDetail(found)
          }}
        />
      )}

      {empty && (
        /* "Log a workout to load the bar" already sits under the balance
           chart; with four blocks between them, saying it twice reads as a
           stutter. What is left is the part only this line says. */
        <p className="text-sm text-muted">
          Every chart here is built from your own sets — nothing on this screen is a
          sample.
        </p>
      )}
    </div>
  )
}

/* ── This week ────────────────────────────────────────────────────────── */

function ThisWeek({
  sessions,
  volumeKg,
  streakWeeks,
  unit,
}: {
  sessions: number
  volumeKg: number
  streakWeeks: number
  unit: Unit
}) {
  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <h2 className="kicker mb-2.5">This week</h2>
      <div className="flex items-stretch">
        <Figure label="Sessions" value={String(sessions)} />
        <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
        <Figure label="Volume" value={formatWeight(volumeKg, unit)} />
        <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
        <Figure
          label="Streak"
          value={`${streakWeeks} wk`}
          extra={<StreakPlates weeks={streakWeeks} />}
        />
      </div>
    </section>
  )
}

function Figure({
  label,
  value,
  extra,
}: {
  label: string
  value: string
  extra?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
      <span className="tnum truncate text-[27px] font-semibold leading-none">
        {value}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        {label}
        {extra}
      </span>
    </div>
  )
}

/** The wordmark's plates, reused. Four, ascending toward the centre. */
function StreakPlates({ weeks }: { weeks: number }) {
  const HEIGHTS = [7, 10, 13, 16]
  const shown = Math.min(weeks, HEIGHTS.length)
  return (
    <span aria-hidden="true" className="flex shrink-0 items-end gap-[3px]">
      {HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={i < shown ? 'bg-accent' : 'bg-neutral-800'}
          style={{ width: 4, height: h, borderRadius: 2 }}
        />
      ))}
    </span>
  )
}

/* ── Muscle balance — the signature ───────────────────────────────────── */

function MuscleBalance({
  groups,
  onOpenCoach,
  empty,
}: {
  groups: MuscleGroupSets[]
  onOpenCoach: () => void
  empty: boolean
}) {
  const lagging = underBand(groups)
  const rows = [...groups].sort((a, b) => num(b.set_count) - num(a.set_count))

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Weekly sets · target band</h2>
        <span className="font-mono text-[11px] text-muted">
          {SET_BAND[0]}–{SET_BAND[1]}
        </span>
      </div>

      {rows.length === 0 ? (
        <>
          {/* Empty still draws the band: the shape of the target is the
              information, and a screen that shows the target explains itself.
              What it never does is draw a fill that is not there. */}
          <BalanceRow label="—" sets={0} />
          <p className="mt-2 text-sm text-muted">Log a workout to load the bar.</p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <BalanceRow
              key={row.muscle_group}
              label={row.muscle_group}
              sets={num(row.set_count)}
            />
          ))}
        </div>
      )}

      {!empty && lagging.length > 0 && (
        <button
          type="button"
          onClick={onOpenCoach}
          className="record-row mt-2.5 flex w-full items-center gap-2 rounded-[6px] px-3 py-2.5 text-start"
        >
          <span className="min-w-0 flex-1 text-[13px]">
            <span className="font-mono text-[11px] text-accent">FOCUS</span>{' '}
            <span className="text-text">
              {lagging.slice(0, 2).join(' and ')}{' '}
              {lagging.slice(0, 2).length === 1 ? 'sits' : 'sit'} under the band.
            </span>{' '}
            <span className="text-muted">The coach has a fix</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-accent">
            ›
          </span>
        </button>
      )}
    </section>
  )
}

/**
 * One group. The productive band is a knurl panel at 33-67% of the track,
 * because 10 and 20 out of a 30-set scale land exactly there.
 *
 * The fill is one hue in three steps: under the band is a neutral (being under
 * is quiet, not an error), in-band is the accent, over is the darkest step of
 * the same ramp. Three meanings, no second colour — which is how the
 * one-accent rule survives a chart that needs to say three things.
 */
function BalanceRow({ label, sets }: { label: string; sets: number }) {
  const pct = Math.min(100, (sets / SCALE_MAX) * 100)
  const state = bandState(sets)
  const fill =
    state === 'in'
      ? 'var(--color-accent)'
      : state === 'over'
        ? 'var(--color-accent-800)'
        : 'var(--color-tile-3)'

  return (
    <div className="flex items-center gap-2">
      <span className="w-[74px] shrink-0 truncate text-[13px] capitalize text-muted">
        {label}
      </span>
      <span
        className="relative block h-[14px] flex-1 overflow-hidden rounded-[3px]"
        style={{ backgroundColor: 'var(--color-tile-1)' }}
      >
        <span
          aria-hidden="true"
          className="knurl absolute inset-block-0 block opacity-70"
          style={{
            insetInlineStart: `${(SET_BAND[0] / SCALE_MAX) * 100}%`,
            width: `${((SET_BAND[1] - SET_BAND[0]) / SCALE_MAX) * 100}%`,
          }}
        />
        <span
          className="absolute inset-block-0 start-0 block rounded-[3px]"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </span>
      <span className="tnum w-7 shrink-0 text-end font-mono text-[13px]">{sets}</span>
    </div>
  )
}

/* ── Session frequency ────────────────────────────────────────────────── */

/**
 * Sessions per week, one bar per week, thirteen weeks back.
 *
 * Volume answers "how hard"; this answers "how often", and of the two it is
 * the one that predicts whether there will be a chart to read in six months.
 * Every week gets a track whether or not it has a bar, because the gap is the
 * information — a missing week that renders as nothing is a week the chart
 * quietly forgave.
 */
function SessionFrequency({ weeks }: { weeks: WeekBucket[] }) {
  const W = 320
  const H = 72
  const total = weeks.reduce((sum, w) => sum + w.sessions, 0)
  // Floored at three so a single session in an otherwise blank quarter does
  // not draw itself a full-height bar.
  const max = Math.max(3, ...weeks.map((w) => w.sessions))
  const average = total / weeks.length
  const slot = W / weeks.length
  const barW = Math.max(3, slot - 3)
  const y = (value: number) => H - (value / max) * (H - 4)

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Sessions · per week</h2>
        <span className="tnum font-mono text-[11px] text-muted">{weeks.length} wk</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        // Aspect ratio rather than a pixel height: with a fixed height the
        // viewBox scales to fit and the chart sits inset from the column
        // everything else on the screen aligns to. Uniform scaling keeps the
        // 2px rules 2px-ish and lets the plot use the width it has.
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={
          total === 0
            ? `Sessions per week, last ${weeks.length} weeks: nothing logged yet`
            : `Sessions per week, last ${weeks.length} weeks: ${total} sessions, averaging ${average.toFixed(1)} a week`
        }
      >
        {weeks.map((week, i) => (
          <rect
            key={week.start.getTime()}
            x={i * slot + (slot - barW) / 2}
            y="0"
            width={barW}
            height={H}
            rx="2"
            fill="var(--color-tile-1)"
          />
        ))}
        {total > 0 && (
          <line
            x1="0"
            x2={W}
            y1={y(average)}
            y2={y(average)}
            stroke="var(--divider)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        )}
        {weeks.map((week, i) =>
          week.sessions === 0 ? null : (
            <rect
              key={week.start.getTime()}
              x={i * slot + (slot - barW) / 2}
              y={y(week.sessions)}
              width={barW}
              height={H - y(week.sessions)}
              rx="2"
              fill="var(--color-accent)"
            />
          ),
        )}
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--divider)" strokeWidth="1" />
      </svg>
      <p className="tnum mt-1 text-[11px] text-muted">
        {total === 0
          ? 'One bar a week. The dashed line arrives with your average.'
          : `avg ${average.toFixed(1)}/wk · ${total} ${total === 1 ? 'session' : 'sessions'} · dashed line is the average`}
      </p>
    </section>
  )
}

/* ── Volume trend ─────────────────────────────────────────────────────── */

/**
 * v2 chart grammar, hand-rolled: amber 2px line, 8% area fill, dashed 2/4
 * gridlines, a dot on the last point. Not recharts — this is three paths, and
 * recharts was half the bundle on a screen the Log tab must never wait for.
 *
 * The range chips do not re-fetch anything. `session_volume_history` already
 * returns every finished workout, so the window is a bucketing decision made
 * over data in hand — instant, offline-safe, and one round trip regardless of
 * how many times the chips are tapped.
 */
function VolumeTrend({
  points,
  span,
  unit,
  range,
  onRange,
}: {
  points: { start: Date; volumeKg: number }[]
  span: VolumeSpan
  unit: Unit
  range: RangeKey
  onRange: (key: RangeKey) => void
}) {
  const W = 320
  const H = 96
  const max = Math.max(1, ...points.map((p) => p.volumeKg))
  const step = points.length > 1 ? W / (points.length - 1) : W
  const plotted = points.map((p, i) => ({
    x: i * step,
    y: H - (p.volumeKg / max) * (H - 8) - 4,
  }))
  const line = plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const last = plotted.at(-1)
  const bucket = span.bucket === 'week' ? 'week' : 'month'

  return (
    <section>
      <h2 className="kicker mb-2.5">Volume · {describeSpan(span)}</h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Volume per ${bucket} over the ${describeSpan(span)}, peaking at ${formatWeight(max, unit)} ${unit}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="var(--divider)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--divider)" strokeWidth="1" />
        <path d={area} fill="var(--color-accent)" opacity="0.08" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {last && <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-accent)" />}
      </svg>
      <p className="tnum mb-2.5 mt-1 text-[11px] text-muted">
        one point per {bucket} · peak {formatWeight(max, unit)} · this {bucket}{' '}
        {formatWeight(points.at(-1)?.volumeKg ?? 0, unit)}
      </p>
      <RangeChips value={range} onChange={onRange} label="Volume range" />
    </section>
  )
}

/* ── Anchor lifts ─────────────────────────────────────────────────────── */

/**
 * The four lifts a program is judged on, each against what the deadlift
 * predicts it should be.
 *
 * Same track-and-fill grammar as the muscle-balance rows, because it answers
 * the same shape of question — where does this sit against where it should
 * sit. The band there is a range; the target here is a point, so it is a tick
 * rather than a knurl panel.
 *
 * The prediction is the usual strength-standards ratio, not a claim about
 * this lifter. A lift under its tick is a lift that has fallen behind the
 * others, which is worth seeing; it is not a failure, so it goes grey rather
 * than shouting.
 */
/** "Squat, Bench and Overhead" — never "Squat and Bench and Overhead". */
function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function AnchorLifts({ rows, unit }: { rows: AnchorRow[]; unit: Unit }) {
  const scale = Math.max(
    1,
    ...rows.flatMap((r) => [r.measuredKg ?? 0, r.predictedKg ?? 0]),
  )
  const measured = rows.filter((r) => r.measuredKg !== null)
  const predicted = rows.some((r) => r.predictedKg !== null)
  const behind = rows.filter(
    (r) =>
      r.measuredKg !== null &&
      r.predictedKg !== null &&
      r.measuredKg < r.predictedKg * 0.95,
  )

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Anchor lifts · vs predicted</h2>
        <span className="font-mono text-[11px] text-muted">est. 1RM</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <AnchorRowBar key={row.label} row={row} scale={scale} unit={unit} />
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {measured.length === 0
          ? 'Four lifts, one bar each. Log a deadlift, a squat, a bench and an overhead press and the bars fill.'
          : !predicted
            ? 'The tick is what your deadlift predicts each lift should be. Log a deadlift and the ticks appear.'
            : behind.length > 0
              ? `Ticks are predicted off your deadlift — squat 0.85, bench 0.75, overhead 0.45. ${joinList(
                  behind.map((r) => r.label),
                )} ${behind.length === 1 ? 'sits' : 'sit'} behind ${
                  behind.length === 1 ? 'its' : 'their'
                } tick. A guide, not a target.`
              : 'Ticks are predicted off your deadlift — squat 0.85, bench 0.75, overhead 0.45. A guide, not a target.'}
      </p>
    </section>
  )
}

function AnchorRowBar({
  row,
  scale,
  unit,
}: {
  row: AnchorRow
  scale: number
  unit: Unit
}) {
  const measured = row.measuredKg
  const predicted = row.predictedKg
  const pct = measured === null ? 0 : Math.min(100, (measured / scale) * 100)
  const tick = predicted === null ? null : Math.min(100, (predicted / scale) * 100)
  // Under its prediction is quiet, not an error — the same reading the
  // muscle-balance band gives an under-worked group.
  const fill =
    measured !== null && predicted !== null && measured < predicted * 0.95
      ? 'var(--color-tile-3)'
      : 'var(--color-accent)'

  return (
    <div className="flex items-center gap-2">
      <span className="w-[74px] shrink-0 truncate text-[13px] text-muted">
        {row.label}
      </span>
      <span
        className="relative block h-[14px] flex-1 overflow-hidden rounded-[3px]"
        style={{ backgroundColor: 'var(--color-tile-1)' }}
      >
        {measured !== null && (
          <span
            className="absolute inset-block-0 start-0 block rounded-[3px]"
            style={{ width: `${pct}%`, backgroundColor: fill }}
          />
        )}
        {tick !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-block-0 block"
            style={{
              insetInlineStart: `calc(${tick}% - 1px)`,
              width: 2,
              backgroundColor: 'var(--color-neutral-300)',
            }}
          />
        )}
      </span>
      <span className="tnum w-11 shrink-0 text-end font-mono text-[13px]">
        {measured === null ? (
          <span style={{ color: 'var(--color-tile-3)' }}>—</span>
        ) : (
          Math.round(toDisplayWeight(measured, unit))
        )}
      </span>
    </div>
  )
}

/* ── Strength list ────────────────────────────────────────────────────── */

const STRENGTH_SHOWN = 12

/**
 * The range chips here scope *which lifts are listed* — the ones trained in
 * the window — and not the numbers beside them, which stay all-time bests.
 *
 * That is a deliberate line, and the caption draws it out loud. Windowing the
 * best itself would mean a new `strength_summary(p_days)` signature, and a
 * client calling an RPC that only exists once someone applies a migration by
 * hand is a Progress screen that breaks in production. See DECISIONS.md.
 */
function StrengthList({
  rows,
  total,
  unit,
  range,
  onRange,
  onOpen,
}: {
  rows: StrengthRow[]
  /** Lifts before the range filter, so the caption can say what it hid. */
  total: number
  unit: Unit
  range: RangeKey
  onRange: (key: RangeKey) => void
  onOpen: (exerciseId: string) => void
}) {
  const shown = rows.slice(0, STRENGTH_SHOWN)
  const scope = range === 'ALL' ? '' : ` trained in ${describeRange(range)}`
  const caption =
    rows.length > shown.length
      ? `top ${shown.length} of ${rows.length} lifts${scope} · est. 1RM is your all-time best`
      : `${rows.length} ${rows.length === 1 ? 'lift' : 'lifts'}${scope} · est. 1RM is your all-time best`

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Strength · est. 1RM</h2>
        {rows.length < total && (
          <span className="tnum font-mono text-[11px] text-muted">
            {rows.length}/{total}
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <p className="py-2 text-sm text-muted">
          Nothing trained in {describeRange(range)}. Widen the range to see older lifts.
        </p>
      )}

      <ul>
        {shown.map((row, i) => {
          const best = num(row.best_e1rm_kg)
          const recent = row.recent_e1rm_kg === null ? null : num(row.recent_e1rm_kg)
          const previous =
            row.previous_e1rm_kg === null ? null : num(row.previous_e1rm_kg)
          // Recent form against the four weeks before it. A delta built on the
          // all-time best could only ever rise, and a decline is the one
          // direction worth surfacing.
          const delta = recent !== null && previous !== null ? recent - previous : null
          return (
            <li key={row.exercise_id}>
              {i > 0 && <div className="rule-fade" />}
              <button
                type="button"
                onClick={() => onOpen(row.exercise_id)}
                className="flex w-full items-center gap-3 py-2.5 text-start"
              >
                <ExerciseThumb
                  exercise={
                    {
                      id: row.exercise_id,
                      name: row.name,
                      muscle_group: row.muscle_group,
                      equipment: 'other',
                      image_url: row.image_url,
                      is_custom: false,
                      owner_id: null,
                      default_rest_seconds: null,
                    } as Exercise
                  }
                  size={40}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="block text-[11px] text-muted">
                    last:{' '}
                    {row.last_trained_at ? formatRelativeDay(row.last_trained_at) : '—'}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[20px] font-medium">
                  {Math.round(toDisplayWeight(best, unit))}
                </span>
                <span className="tnum w-14 shrink-0 text-end font-mono text-[12px]">
                  <Delta deltaKg={delta} unit={unit} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {rows.length > 0 && <p className="mt-1.5 text-[11px] text-muted">{caption}</p>}

      <div className="mt-2.5">
        <RangeChips value={range} onChange={onRange} label="Strength range" />
      </div>
    </section>
  )
}

function Delta({ deltaKg, unit }: { deltaKg: number | null; unit: Unit }) {
  if (deltaKg === null) return <span style={{ color: 'var(--color-tile-3)' }}>—</span>
  const shown = Math.round(Math.abs(toDisplayWeight(deltaKg, unit)))
  if (shown === 0) return <span style={{ color: 'var(--color-tile-3)' }}>→ 0</span>
  return deltaKg > 0 ? (
    <span className="text-accent">▲ {shown}</span>
  ) : (
    <span className="text-muted">▼ {shown}</span>
  )
}
