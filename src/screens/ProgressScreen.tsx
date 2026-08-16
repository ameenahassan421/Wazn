import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useLocale } from '../lib/locale-context'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { formatWeight, toDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import {
  formatCount,
  formatRelativeDay,
  formatVolume,
  formatVolumeWithUnit,
} from '../lib/format'
import type { Exercise } from '../lib/types'
import { ExerciseDetail } from '../components/ExerciseDetail'
import { ExerciseThumb } from '../components/ExerciseThumb'
import { RangeChips } from '../components/RangeChips'
import { SeriesChart } from '../components/SeriesChart'
import {
  SET_BAND,
  bandState,
  liftBalance,
  monthlyVolume,
  recentRecords,
  sessionsPerWeek,
  underBand,
  weeklyVolume,
} from '../lib/progress'
import type {
  BalanceRow as AnchorRow,
  ExerciseBest,
  MuscleGroupSets,
  RecordEntry,
  RecordSetRow,
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
  const { t } = useLocale()

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
  const [recordRows, setRecordRows] = useState<RecordSetRow[]>([])
  const [volumeRange, setVolumeRange] = useState<RangeKey>(DEFAULT_RANGE)
  const [strengthRange, setStrengthRange] = useState<RangeKey>(DEFAULT_RANGE)

  useEffect(() => {
    let active = true
    void (async () => {
      const [volume, muscle, lifts, streakRows, catalogue, recordRows] =
        await Promise.all([
          supabase.rpc('session_volume_history'),
          supabase.rpc('muscle_group_weekly_sets', { p_days: 7 }),
          supabase.rpc('strength_summary'),
          supabase.rpc('weekly_streak'),
          supabase.from('exercises').select('*').order('name'),
          /*
           * Every record the database has flagged, newest first.
           *
           * `workout_sets_records_idx` (migration 0009) is a partial index over
           * exactly this predicate, so the scan touches only record rows rather
           * than all 3,200 sets. The order goes through the embedded workout
           * because a set has no date of its own, and the limit is a ceiling
           * rather than the list length: `recentRecords` sorts and slices, so a
           * ceiling that clipped a newer record would silently drop it.
           */
          supabase
            .from('workout_sets')
            .select(
              'exercise_id, weight_kg, reps, pr_weight, pr_e1rm, workouts!inner(started_at)',
            )
            .or('pr_weight.eq.true,pr_e1rm.eq.true')
            .order('started_at', { referencedTable: 'workouts', ascending: false })
            .limit(120),
        ])
      if (!active) return

      const failure =
        volume.error ??
        muscle.error ??
        lifts.error ??
        streakRows.error ??
        catalogue.error
      if (failure) {
        setError(describeError(t('progress.error.load'), failure))
        setLoading(false)
        return
      }

      setSessions((volume.data ?? []) as SessionVolumeRow[])
      setGroups((muscle.data ?? []) as MuscleGroupSets[])
      setStrength((lifts.data ?? []) as StrengthRow[])
      setStreak(((streakRows.data ?? []) as { weeks: number }[])[0]?.weeks ?? 0)
      setExercises((catalogue.data ?? []) as Exercise[])
      // Records are deliberately NOT part of the `failure` check above: the
      // whole screen should not go to an error page because one motivational
      // block could not load. An error here means no Records section.
      setRecordRows(
        recordRows.error
          ? []
          : ((recordRows.data ?? []) as unknown[]).map((raw) => {
              const row = raw as RecordSetRow & {
                workouts?: { started_at: string } | null
              }
              return { ...row, started_at: row.workouts?.started_at ?? '' }
            }),
      )
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [t])

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

  if (loading) return <p className="py-10 text-sm text-muted">{t('chrome.loading')}</p>
  if (detail)
    return (
      <ExerciseDetail
        exercise={detail}
        onBack={() => setDetail(null)}
        // A rename has to reach the catalogue this screen is holding, or the
        // strength list keeps the old name until the tab is reloaded and the
        // user is left wondering whether the save took.
        onChanged={(updated) => {
          setDetail(updated)
          setExercises((rows) => rows.map((e) => (e.id === updated.id ? updated : e)))
          setStrength((rows) =>
            rows.map((r) =>
              r.exercise_id === updated.id ? { ...r, name: updated.name } : r,
            ),
          )
        }}
        onDeleted={(id) => {
          setExercises((rows) => rows.filter((e) => e.id !== id))
          setStrength((rows) => rows.filter((r) => r.exercise_id !== id))
        }}
      />
    )

  const empty = sessions.length === 0 && strength.length === 0

  const byId = new Map(exercises.map((e) => [e.id, e]))
  const records = recentRecords(recordRows, (id) => byId.get(id)?.name)
  // A record row leads to the lift's page, the same destination the strength
  // list uses, so a record is a way in rather than a dead end.
  const openRecord = (exerciseId: string) => {
    const exercise = byId.get(exerciseId)
    if (exercise) setDetail(exercise)
  }

  return (
    <div className="flex flex-col gap-5 py-3">
      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-soft"
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

      {/* Records sit second, above the diagnostics, because they are the one
          block on this screen that answers "am I getting stronger?" without
          being read. Nothing renders when there are none: a "no records yet"
          panel on a new account is a reminder of an absence. */}
      {records.length > 0 && (
        <Records entries={records} unit={unit} onOpen={openRecord} />
      )}

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
        <p className="text-sm text-muted">{t('progress.empty_notice')}</p>
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
  const { t } = useLocale()
  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <h2 className="kicker mb-2.5">{t('progress.this_week')}</h2>
      <div className="flex items-stretch">
        <Figure label={t('progress.sessions')} value={formatCount(sessions)} />
        <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
        <Figure label={t('progress.volume')} value={formatVolume(volumeKg, unit)} />
        <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
        <Figure
          label={t('progress.streak')}
          value={`${formatCount(streakWeeks)} ${t('progress.wk')}`}
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
  const { t } = useLocale()
  const lagging = underBand(groups)
  const rows = [...groups].sort((a, b) => num(b.set_count) - num(a.set_count))

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="kicker flex-1">{t('progress.balance.title')}</h2>
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
          <p className="mt-2 text-sm text-muted">{t('progress.balance.empty')}</p>
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

      {!empty &&
        lagging.length > 0 &&
        (() => {
          const laggingTwo = lagging.slice(0, 2)
          const joined = joinList(laggingTwo, t('progress.and'))
          const verb =
            laggingTwo.length === 1
              ? t('progress.balance.verb.sits')
              : t('progress.balance.verb.sit')
          return (
            <button
              type="button"
              onClick={onOpenCoach}
              className="record-row mt-2.5 flex w-full items-center gap-2 rounded-[6px] px-3 py-2.5 text-start"
            >
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="font-mono text-[11px] text-soft">
                  {t('progress.balance.focus')}
                </span>{' '}
                <span className="text-text">
                  {joined} {verb} {t('progress.balance.under_band')}
                </span>{' '}
                <span className="text-muted">{t('progress.balance.coach_hint')}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-soft">
                ›
              </span>
            </button>
          )
        })()}
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
  const { t } = useLocale()
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
        <h2 className="kicker flex-1">{t('progress.frequency.title')}</h2>
        <span className="tnum font-mono text-[11px] text-muted">
          {formatCount(weeks.length)} {t('progress.wk')}
        </span>
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
            ? t('progress.frequency.aria.empty', { weeks: String(weeks.length) })
            : t('progress.frequency.aria.data', {
                weeks: String(weeks.length),
                count: formatCount(total),
                avg: average.toFixed(1),
              })
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
          ? t('progress.frequency.empty_caption')
          : t('progress.frequency.caption', {
              avg: average.toFixed(1),
              count: formatCount(total),
              sessions:
                total === 1
                  ? t('progress.frequency.session')
                  : t('progress.frequency.sessions'),
            })}
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
  const { t } = useLocale()
  const max = Math.max(1, ...points.map((p) => p.volumeKg))
  const bucket = span.bucket === 'week' ? 'week' : 'month'

  return (
    <section>
      <h2 className="kicker mb-2.5">
        {t('progress.volume.heading', { span: describeSpan(span) })}
      </h2>
      <SeriesChart
        values={points.map((p) => p.volumeKg)}
        ariaLabel={t('progress.volume.aria', {
          bucket: t(`progress.volume.bucket.${bucket}`),
          span: describeSpan(span),
          peak: formatVolumeWithUnit(max, unit),
        })}
      />
      <p className="tnum mb-2.5 mt-1 text-[11px] text-muted">
        {t('progress.volume.caption', {
          bucket: t(`progress.volume.bucket.${bucket}`),
          peak: formatVolume(max, unit),
          current: formatVolume(points.at(-1)?.volumeKg ?? 0, unit),
        })}
      </p>
      <RangeChips
        value={range}
        onChange={onRange}
        label={t('progress.volume.range_label')}
      />
    </section>
  )
}

/* ── Records ──────────────────────────────────────────────────────────── */

/**
 * Every record the database has flagged, newest first.
 *
 * Distinct from the strength list below it, which answers "where is this lift
 * now". This answers "what have I just beaten", which is the question that
 * makes somebody open the tab. The flags come from migration 0009's trigger, so
 * nothing here decides what counts as a record.
 *
 * `both` is one set that beat the load and the estimate at once. It gets one
 * row and one label rather than two entries, because it was one set.
 */
const RECORD_LABEL_KEY: Record<'weight' | 'e1rm' | 'both', string> = {
  weight: 'progress.record.weight',
  e1rm: 'progress.record.e1rm',
  both: 'progress.record.both',
}

function Records({
  entries,
  unit,
  onOpen,
}: {
  entries: RecordEntry[]
  unit: Unit
  onOpen: (exerciseId: string) => void
}) {
  const { t } = useLocale()
  return (
    <section>
      <h2 className="kicker mb-2.5">{t('progress.records.title')}</h2>
      <ul className="ring-edge bg-surface" style={{ borderRadius: 'var(--radius-md)' }}>
        {entries.map((entry) => (
          <li key={`${entry.exercise_id}-${entry.at}-${entry.kind}`}>
            <button
              type="button"
              onClick={() => onOpen(entry.exercise_id)}
              className="flex h-14 w-full items-center gap-3 border-b border-line px-3 text-start last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {entry.name}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {t(RECORD_LABEL_KEY[entry.kind])} · {formatRelativeDay(entry.at)}
                </span>
              </span>
              <span className="tnum shrink-0 text-2xl font-medium">
                {formatWeight(entry.weight_kg, unit)}
                <span className="ms-1 text-xs font-normal text-muted">
                  {unit} × {entry.reps}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
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
function joinList(items: string[], conjunction = 'and'): string {
  if (items.length <= 2) return items.join(` ${conjunction} `)
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

function AnchorLifts({ rows, unit }: { rows: AnchorRow[]; unit: Unit }) {
  const { t } = useLocale()
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
        <h2 className="kicker flex-1">{t('progress.anchor.title')}</h2>
        <span className="font-mono text-[11px] text-muted">
          {t('progress.anchor.1rm')}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <AnchorRowBar key={row.label} row={row} scale={scale} unit={unit} />
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {measured.length === 0
          ? t('progress.anchor.empty')
          : !predicted
            ? t('progress.anchor.no_predict')
            : behind.length > 0
              ? t('progress.anchor.behind', {
                  names: joinList(
                    behind.map((r) => r.label),
                    t('progress.and'),
                  ),
                  verb:
                    behind.length === 1
                      ? t('progress.anchor.verb.sits')
                      : t('progress.anchor.verb.sit'),
                  possessive:
                    behind.length === 1
                      ? t('progress.anchor.its')
                      : t('progress.anchor.their'),
                })
              : t('progress.anchor.on_track')}
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
  const { t } = useLocale()
  const shown = rows.slice(0, STRENGTH_SHOWN)
  const scope =
    range === 'ALL' ? '' : t('progress.strength.scope', { range: describeRange(range) })
  const caption =
    rows.length > shown.length
      ? t('progress.strength.caption.many', {
          shown: String(shown.length),
          total: String(rows.length),
          scope,
        })
      : t('progress.strength.caption.few', {
          count: String(rows.length),
          lifts:
            rows.length === 1
              ? t('progress.strength.lift')
              : t('progress.strength.lifts'),
          scope,
        })

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="kicker flex-1">{t('progress.strength.title')}</h2>
        {rows.length < total && (
          <span className="tnum font-mono text-[11px] text-muted">
            {rows.length}/{total}
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <p className="py-2 text-sm text-muted">
          {t('progress.strength.empty', { range: describeRange(range) })}
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
                    {t('progress.strength.last')}{' '}
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
        <RangeChips
          value={range}
          onChange={onRange}
          label={t('progress.strength.range_label')}
        />
      </div>
    </section>
  )
}

function Delta({ deltaKg, unit }: { deltaKg: number | null; unit: Unit }) {
  if (deltaKg === null) return <span style={{ color: 'var(--color-tile-3)' }}>—</span>
  const shown = Math.round(Math.abs(toDisplayWeight(deltaKg, unit)))
  if (shown === 0) return <span style={{ color: 'var(--color-tile-3)' }}>→ 0</span>
  return deltaKg > 0 ? (
    <span className="text-soft">▲ {shown}</span>
  ) : (
    <span className="text-muted">▼ {shown}</span>
  )
}
