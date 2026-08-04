import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { toDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import { formatShortDate } from '../lib/format'
import type { Exercise, ExerciseUsageRow, OneRepMaxPoint } from '../lib/types'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseThumb } from '../components/ExerciseThumb'
import { ExerciseDetail } from '../components/ExerciseDetail'
import { CoachNotes } from '../components/CoachNotes'
import {
  SET_BAND,
  heatStep,
  liftBalance,
  monthlyVolume,
  sessionsPerWeek,
  trainingCalendar,
  underBand,
} from '../lib/progress'
import type { ExerciseBest, MuscleGroupSets, SessionVolumeRow } from '../lib/progress'

type View = 'strength' | 'volume' | 'balance'

const VIEWS: { id: View; label: string }[] = [
  { id: 'strength', label: 'Strength' },
  { id: 'volume', label: 'Volume' },
  { id: 'balance', label: 'Balance' },
]

/** One decimal, no trailing ".0". */
function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Shown when a Progress RPC does not answer.
 *
 * This used to read "Apply migration 0007 and reload", which was correct while
 * 0007 was unapplied and Ameen was the only user. 0007 and 0008 are live now,
 * so the only way a reader reaches this text is a genuine fault — and telling a
 * beta tester in Cairo to apply a migration is telling them the app is broken
 * in a language that is not theirs to speak.
 */
function Unavailable() {
  return (
    <p className="py-8 text-sm text-muted">
      This chart is not loading right now. Your workouts are safe — try again in a
      moment.
    </p>
  )
}

function Kicker({ children, note }: { children: string; note?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="kicker flex-1">{children}</h3>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  )
}

export function ProgressScreen() {
  const { unit } = useUnit()
  const [view, setView] = useState<View>('strength')

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [usage, setUsage] = useState<Map<string, ExerciseUsageRow>>(new Map())
  const [selected, setSelected] = useState<Exercise | null>(null)

  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [detail, setDetail] = useState<Exercise | null>(null)
  // The picker is a layer: system back returns to the charts, not out of
  // the app.
  useBackLayer(picking, () => setPicking(false))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const [catalogue, usageRows] = await Promise.all([
        supabase.from('exercises').select('*').order('name'),
        supabase.rpc('exercise_usage'),
      ])
      if (!active) return

      const failure = catalogue.error ?? usageRows.error
      if (failure) {
        setError(describeError('Loading your exercises', failure))
        setLoading(false)
        return
      }

      const list = (catalogue.data ?? []) as Exercise[]
      const usageMap = new Map(
        ((usageRows.data ?? []) as ExerciseUsageRow[]).map((row) => [
          row.exercise_id,
          row,
        ]),
      )
      setExercises(list)
      setUsage(usageMap)

      // Default to the most recently trained lift so the tab opens on something.
      const mostRecent = [...usageMap.values()].sort(
        (a, b) =>
          new Date(b.last_used ?? 0).getTime() - new Date(a.last_used ?? 0).getTime(),
      )[0]
      setSelected(
        mostRecent ? (list.find((e) => e.id === mostRecent.exercise_id) ?? null) : null,
      )
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <p className="py-10 text-sm text-muted">Loading…</p>

  if (detail) {
    return <ExerciseDetail exercise={detail} onBack={() => setDetail(null)} />
  }

  if (picking) {
    return (
      <ExercisePicker
        exercises={exercises}
        usage={usage}
        onPick={(exercise) => {
          setSelected(exercise)
          setPicking(false)
        }}
        onCancel={() => setPicking(false)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <div
        className="flex w-full overflow-hidden"
        style={{
          border: '1px solid var(--divider)',
          borderRadius: 'var(--radius-md)',
        }}
        role="tablist"
      >
        {VIEWS.map((v, i) => {
          const on = v.id === view
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v.id)}
              className={`h-12 flex-1 text-sm ${on ? 'font-medium text-accent' : 'text-muted'}`}
              style={{
                boxShadow: on ? 'inset 0 0 0 1px var(--color-accent)' : undefined,
                borderInlineStart: i > 0 ? '1px solid var(--divider)' : undefined,
              }}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      {/* Above the charts, because it is the reading of them. Below the tab
          bar, because switching tabs must not wait for it. */}
      <CoachNotes />

      {view === 'strength' && (
        <StrengthView
          selected={selected}
          unit={unit}
          onPick={() => setPicking(true)}
          onOpenDetail={() => selected && setDetail(selected)}
          onError={setError}
        />
      )}
      {view === 'volume' && <VolumeView unit={unit} />}
      {view === 'balance' && <BalanceView unit={unit} />}
    </div>
  )
}

/* ── Strength ─────────────────────────────────────────────────────────── */

function StrengthView({
  selected,
  unit,
  onPick,
  onOpenDetail,
  onError,
}: {
  selected: Exercise | null
  unit: Unit
  onPick: () => void
  onOpenDetail: () => void
  onError: (message: string | null) => void
}) {
  // The series carries the exercise it belongs to, so switching exercises does
  // not need an effect to clear the old points — they simply stop matching.
  const [series, setSeries] = useState<{
    exerciseId: string
    points: OneRepMaxPoint[]
  } | null>(null)
  const [reps, setReps] = useState<{
    exerciseId: string
    buckets: { bucket: string; set_count: number | string }[] | null
  } | null>(null)

  useEffect(() => {
    if (!selected) return
    const exerciseId = selected.id
    let active = true
    void supabase
      .rpc('exercise_1rm_history', { p_exercise_id: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) {
          onError(describeError('Loading the trend for that exercise', rpcError))
          setSeries({ exerciseId, points: [] })
          return
        }
        onError(null)
        setSeries({ exerciseId, points: (data ?? []) as OneRepMaxPoint[] })
      })
    return () => {
      active = false
    }
  }, [selected, onError])

  useEffect(() => {
    if (!selected) return
    const exerciseId = selected.id
    let active = true
    void supabase
      .rpc('exercise_rep_distribution', { p_exercise_id: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        // A missing function is not an error worth interrupting the tab for;
        // the block below says what to do about it.
        setReps({
          exerciseId,
          buckets: rpcError
            ? null
            : ((data ?? []) as { bucket: string; set_count: number | string }[]),
        })
      })
    return () => {
      active = false
    }
  }, [selected])

  const points = useMemo(
    () => (series && series.exerciseId === selected?.id ? series.points : []),
    [series, selected?.id],
  )
  const loadingChart = selected !== null && series?.exerciseId !== selected.id

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        t: new Date(point.started_at).getTime(),
        value: toDisplayWeight(Number(point.best_1rm_kg), unit),
      })),
    [points, unit],
  )

  // Axis bounds snap to 5 so the ticks read as round numbers.
  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 1]
    const values = chartData.map((d) => d.value)
    return [
      Math.floor((Math.min(...values) - 5) / 5) * 5,
      Math.ceil((Math.max(...values) + 5) / 5) * 5,
    ]
  }, [chartData])

  const summary = useMemo(() => {
    if (chartData.length < 2) return null
    const first = chartData[0].value
    const last = chartData[chartData.length - 1].value
    const best = Math.max(...chartData.map((d) => d.value))
    return { first, last, best, delta: last - first }
  }, [chartData])

  return (
    <>
      {/* Two targets, not one: the row's subject is the exercise, so tapping it
          opens the exercise. Swapping to a different one is its own action and
          says so. Siblings rather than nested buttons — a button inside a
          button is invalid and the inner one stops being reachable. */}
      <div
        className="ring-edge flex min-h-14 w-full items-center bg-surface ps-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <button
          type="button"
          onClick={selected ? onOpenDetail : onPick}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-start"
        >
          {selected && <ExerciseThumb exercise={selected} size={40} />}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-muted">Exercise</span>
            <span className="block truncate text-sm font-medium">
              {selected?.name ?? 'Pick an exercise'}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onPick}
          className="btn-base btn-quiet h-12 shrink-0 px-3 text-[13px] text-accent"
        >
          Change
        </button>
      </div>

      {!selected || loadingChart ? (
        <p className="py-6 text-sm text-muted">
          {loadingChart ? 'Loading…' : 'Log a few sessions to see your trend.'}
        </p>
      ) : chartData.length < 2 ? (
        <p className="py-6 text-sm text-muted">Log a few sessions to see your trend.</p>
      ) : (
        <>
          <div>
            <p className="text-[11px] text-muted">Estimated 1RM · latest</p>
            <div className="flex items-baseline gap-2">
              <p className="tnum text-[42px] font-medium tracking-[-0.03em]">
                {trim(summary?.last ?? 0)}
                <span className="ms-1.5 text-[15px] font-normal text-muted">
                  {unit}
                </span>
              </p>
              {summary && (
                <p className="tnum ms-auto text-[13px] text-accent-300">
                  {summary.delta >= 0 ? '+' : ''}
                  {trim(summary.delta)} {unit} since{' '}
                  {formatShortDate(points[0].started_at)}
                </p>
              )}
            </div>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke="rgba(236,235,232,0.07)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleDateString(undefined, {
                      month: 'short',
                      year: '2-digit',
                    })
                  }
                  tick={{ fill: '#75716a', fontSize: 10 }}
                  stroke="rgba(236,235,232,0.07)"
                  minTickGap={28}
                />
                <YAxis
                  width={40}
                  domain={yDomain}
                  tick={{ fill: '#75716a', fontSize: 10 }}
                  stroke="rgba(236,235,232,0.07)"
                  tickFormatter={(value: number) => String(Math.round(value))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161513',
                    border: '1px solid #2a2825',
                    borderRadius: 8,
                    color: '#ecebe8',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  labelFormatter={(value: number) =>
                    formatShortDate(new Date(value).toISOString())
                  }
                  formatter={(value: number) => [
                    `${trim(Number(value))} ${unit}`,
                    'est. 1RM',
                  ]}
                />
                <Line
                  // Straight segments: a smoothed curve would invent values
                  // between sessions that were never lifted.
                  type="linear"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--color-accent)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <section>
            <Kicker>Rep range distribution</Kicker>
            {reps?.exerciseId !== selected.id ? (
              <p className="py-4 text-sm text-muted">Loading…</p>
            ) : reps.buckets === null ? (
              <Unavailable />
            ) : (
              <RepRangeBars buckets={reps.buckets} />
            )}
          </section>

          <p className="text-[11px] text-muted">
            Epley estimate from working sets: weight × (1 + reps ÷ 30). Warmups and sets
            without both weight and reps are excluded.
          </p>
        </>
      )}
    </>
  )
}

/**
 * Working sets by rep range, drawn as a plate stack: the two heaviest buckets
 * take the full accent and the rest step back down the ramp, the same way the
 * wordmark's plates descend toward the sleeve.
 */
function RepRangeBars({
  buckets,
}: {
  buckets: { bucket: string; set_count: number | string }[]
}) {
  const values = buckets.map((b) => num(b.set_count))
  const max = Math.max(1, ...values)
  const ranked = [...values].sort((a, b) => b - a)
  const H = 86

  return (
    <svg
      viewBox={`0 0 340 ${H + 18}`}
      className="w-full"
      style={{ height: H + 18 }}
      role="img"
      aria-label="Working sets by rep range"
    >
      {buckets.map((b, i) => {
        const v = values[i]
        const h = Math.max(v > 0 ? 3 : 0, (v / max) * H)
        const rank = ranked.indexOf(v)
        const fill =
          v === 0
            ? 'var(--color-neutral-900)'
            : rank < 2
              ? 'var(--color-accent)'
              : v === Math.min(...values.filter((x) => x > 0))
                ? 'var(--color-accent-800)'
                : 'var(--color-accent-700)'
        const x = 14 + i * 64
        return (
          <g key={b.bucket}>
            <rect x={x} y={H - h} width={46} height={h} rx={3} fill={fill} />
            <text
              x={x + 23}
              y={H + 13}
              textAnchor="middle"
              fontSize={10}
              fill="#75716a"
            >
              {b.bucket}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Volume ───────────────────────────────────────────────────────────── */

function VolumeView({ unit }: { unit: Unit }) {
  const [rows, setRows] = useState<SessionVolumeRow[] | null | 'missing'>(null)

  useEffect(() => {
    let active = true
    void supabase.rpc('session_volume_history').then(({ data, error: rpcError }) => {
      if (!active) return
      setRows(rpcError ? 'missing' : ((data ?? []) as SessionVolumeRow[]))
    })
    return () => {
      active = false
    }
  }, [])

  const derived = useMemo(() => {
    if (!Array.isArray(rows)) return null
    return {
      weeks: sessionsPerWeek(rows),
      months: monthlyVolume(rows),
      days: trainingCalendar(rows),
      sessions: rows,
    }
  }, [rows])

  if (rows === null) return <p className="py-8 text-sm text-muted">Loading…</p>
  if (rows === 'missing') return <Unavailable />
  if (!derived || derived.sessions.length === 0) {
    return <p className="py-8 text-sm text-muted">Finish a workout to see volume.</p>
  }

  const maxDay = Math.max(0, ...derived.days.map((d) => d.volumeKg))
  const TARGET = 4
  const maxWeek = Math.max(TARGET, ...derived.weeks.map((w) => w.sessions))
  const maxMonth = Math.max(1, ...derived.months.map((m) => m.volumeKg))

  return (
    <>
      <section>
        <Kicker note={`target ${TARGET}`}>Sessions per week</Kicker>
        <svg
          viewBox="0 0 340 84"
          className="w-full"
          style={{ height: 84 }}
          role="img"
          aria-label="Sessions per week against a target of four"
        >
          <line
            x1={0}
            x2={340}
            y1={70 - (TARGET / maxWeek) * 62}
            y2={70 - (TARGET / maxWeek) * 62}
            stroke="var(--color-accent-600)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {derived.weeks.map((w, i) => {
            const h = (w.sessions / maxWeek) * 62
            return (
              <rect
                key={w.start.getTime()}
                x={6 + i * 25}
                y={70 - h}
                width={18}
                height={h}
                rx={2}
                fill={
                  w.sessions >= TARGET
                    ? 'var(--color-accent)'
                    : 'var(--color-accent-700)'
                }
              />
            )
          })}
          <text x={0} y={81} fontSize={9} fill="#75716a">
            13 weeks ago
          </text>
          <text x={340} y={81} fontSize={9} fill="#75716a" textAnchor="end">
            this week
          </text>
        </svg>
      </section>

      <section>
        <Kicker note={unit === 'kg' ? 'thousands of kg' : 'thousands of lb'}>
          Monthly volume
        </Kicker>
        <svg
          viewBox="0 0 340 96"
          className="w-full"
          style={{ height: 96 }}
          role="img"
          aria-label="Total load moved each month"
        >
          {derived.months.map((m, i) => {
            const h = (m.volumeKg / maxMonth) * 70
            const peak = m.volumeKg === maxMonth && m.volumeKg > 0
            return (
              <g key={m.start.getTime()}>
                <rect
                  x={8 + i * 48}
                  y={78 - h}
                  width={34}
                  height={h}
                  rx={3}
                  fill={peak ? 'var(--color-accent)' : 'var(--color-accent-600)'}
                />
                <text
                  x={25 + i * 48}
                  y={92}
                  fontSize={9}
                  fill="#75716a"
                  textAnchor="middle"
                >
                  {m.start.toLocaleDateString(undefined, { month: 'short' })}
                </text>
              </g>
            )
          })}
        </svg>
      </section>

      <section>
        <Kicker>Session workload</Kicker>
        <svg
          viewBox="0 0 340 84"
          className="w-full"
          style={{ height: 84 }}
          role="img"
          aria-label="Volume per session over time; each dot is one workout"
        >
          <line x1={0} x2={340} y1={76} y2={76} stroke="rgba(236,235,232,0.07)" />
          {(() => {
            const list = derived.sessions
            const maxV = Math.max(1, ...list.map((r) => num(r.volume_kg)))
            const t0 = new Date(list[0].started_at).getTime()
            const t1 = new Date(list[list.length - 1].started_at).getTime()
            const span = Math.max(1, t1 - t0)
            const xy = list.map((r) => ({
              x: ((new Date(r.started_at).getTime() - t0) / span) * 332 + 4,
              y: 74 - (num(r.volume_kg) / maxV) * 66,
            }))
            // A coarse trend: mean y of each fifth, joined. Enough to show
            // direction without implying a fitted model.
            const bins = 5
            const trend: string[] = []
            for (let b = 0; b < bins; b += 1) {
              const slice = xy.slice(
                Math.floor((b * xy.length) / bins),
                Math.max(
                  Math.floor(((b + 1) * xy.length) / bins),
                  Math.floor((b * xy.length) / bins) + 1,
                ),
              )
              if (slice.length === 0) continue
              const mx = slice.reduce((s, p) => s + p.x, 0) / slice.length
              const my = slice.reduce((s, p) => s + p.y, 0) / slice.length
              trend.push(`${mx.toFixed(1)},${my.toFixed(1)}`)
            }
            return (
              <>
                {xy.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill="var(--color-accent-500)"
                    opacity={0.75}
                  />
                ))}
                {trend.length > 1 && (
                  <polyline
                    points={trend.join(' ')}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
              </>
            )
          })()}
        </svg>
      </section>

      <section>
        <Kicker>Training calendar</Kicker>
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column' }}
        >
          {derived.days.map((d) => {
            const step = heatStep(d.volumeKg, maxDay)
            const fill = [
              'rgba(236,235,232,0.06)',
              'var(--color-accent-900)',
              'var(--color-accent-700)',
              'var(--color-accent-500)',
              'var(--color-accent)',
            ][step]
            return (
              <span
                key={d.date.getTime()}
                title={d.date.toDateString()}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: fill,
                }}
              />
            )
          })}
        </div>
      </section>
    </>
  )
}

/* ── Balance ──────────────────────────────────────────────────────────── */

function BalanceView({ unit }: { unit: Unit }) {
  const [bests, setBests] = useState<ExerciseBest[] | null | 'missing'>(null)
  const [groups, setGroups] = useState<MuscleGroupSets[] | null | 'missing'>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const [b, g] = await Promise.all([
        supabase.rpc('exercise_best_e1rm'),
        supabase.rpc('muscle_group_weekly_sets', { p_days: 7 }),
      ])
      if (!active) return
      setBests(b.error ? 'missing' : ((b.data ?? []) as ExerciseBest[]))
      setGroups(g.error ? 'missing' : ((g.data ?? []) as MuscleGroupSets[]))
    })()
    return () => {
      active = false
    }
  }, [])

  if (bests === null || groups === null) {
    return <p className="py-8 text-sm text-muted">Loading…</p>
  }
  if (bests === 'missing' || groups === 'missing') return <Unavailable />

  const balance = liftBalance(bests)
  const maxLift = Math.max(
    1,
    ...balance.flatMap((r) => [r.measuredKg ?? 0, r.predictedKg ?? 0]),
  )
  const maxSets = Math.max(SET_BAND[1] + 4, ...groups.map((g) => num(g.set_count)))
  const behind = underBand(groups)
  const bench = balance.find((r) => r.label === 'Bench')
  const benchGap =
    bench?.measuredKg != null && bench.predictedKg != null
      ? bench.predictedKg - bench.measuredKg
      : null

  return (
    <>
      <section>
        <Kicker>Lift balance · est. 1RM vs predicted</Kicker>
        <ul className="flex flex-col gap-2.5">
          {balance.map((row) => (
            <li key={row.label} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-muted">{row.label}</span>
              <span className="relative h-4 flex-1">
                <span
                  className="absolute inset-inline-start-0 top-1 block"
                  style={{
                    width: `${((row.measuredKg ?? 0) / maxLift) * 100}%`,
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--color-accent)',
                  }}
                />
                {row.predictedKg != null && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 block"
                    style={{
                      insetInlineStart: `${(row.predictedKg / maxLift) * 100}%`,
                      width: 2,
                      height: 16,
                      background: 'var(--color-neutral-400)',
                    }}
                  />
                )}
              </span>
              <span className="tnum w-12 shrink-0 text-end text-xs">
                {row.measuredKg == null
                  ? '—'
                  : Math.round(toDisplayWeight(row.measuredKg, unit))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-2 text-[10px] text-muted">
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 6,
              borderRadius: 3,
              background: 'var(--color-accent)',
            }}
          />
          you
          <span
            aria-hidden="true"
            style={{
              width: 2,
              height: 11,
              background: 'var(--color-neutral-400)',
              marginInlineStart: 6,
            }}
          />
          predicted from your deadlift
        </p>
      </section>

      <section>
        <Kicker note={`band = ${SET_BAND[0]}–${SET_BAND[1]}`}>
          Weekly sets per group
        </Kicker>
        {groups.length === 0 ? (
          <p className="py-2 text-sm text-muted">No working sets in the last 7 days.</p>
        ) : (
          <div className="relative">
            {/* The productive band, shaded behind every row at once. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-block-0 block"
              style={{
                insetInlineStart: `calc(64px + (100% - 64px - 40px) * ${SET_BAND[0] / maxSets})`,
                width: `calc((100% - 64px - 40px) * ${(SET_BAND[1] - SET_BAND[0]) / maxSets})`,
                background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
                borderInlineStart: '1px solid rgba(240,180,41,0.25)',
                borderInlineEnd: '1px solid rgba(240,180,41,0.25)',
              }}
            />
            <ul className="relative flex flex-col gap-2">
              {groups.map((g) => {
                const count = num(g.set_count)
                const fill =
                  count < SET_BAND[0]
                    ? 'var(--color-neutral-600)'
                    : count <= SET_BAND[1]
                      ? 'var(--color-accent)'
                      : 'var(--color-accent-300)'
                return (
                  <li key={g.muscle_group} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 truncate text-xs text-muted">
                      {g.muscle_group}
                    </span>
                    <span
                      className="h-[9px] flex-1"
                      style={{
                        borderRadius: 5,
                        background: 'rgba(236,235,232,0.07)',
                      }}
                    >
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.min(100, (count / maxSets) * 100)}%`,
                          borderRadius: 5,
                          background: fill,
                        }}
                      />
                    </span>
                    <span className="tnum w-7 shrink-0 text-end text-xs text-muted">
                      {count}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      {(behind.length > 0 || benchGap !== null) && (
        <p
          className="px-3 py-2.5 text-xs"
          style={{
            border: '1px solid var(--color-accent-700)',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
            color: 'color-mix(in srgb, var(--color-text) 72%, transparent)',
          }}
        >
          {behind.length > 0 &&
            `${behind.slice(0, 2).join(' and ')} ${
              behind.length === 1 ? 'sits' : 'sit'
            } under the band this week. `}
          {benchGap !== null &&
            benchGap > 0 &&
            `Bench is ${trim(toDisplayWeight(benchGap, unit))} ${unit} below what your deadlift predicts.`}
        </p>
      )}
    </>
  )
}
