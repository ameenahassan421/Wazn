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
import { useUnit } from '../lib/unit-context'
import { toDisplayWeight } from '../lib/units'
import { formatShortDate } from '../lib/format'
import type { Exercise, ExerciseUsageRow, OneRepMaxPoint } from '../lib/types'
import { ExercisePicker } from '../components/ExercisePicker'

/** One decimal, no trailing ".0". */
function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

export function ProgressScreen() {
  const { unit } = useUnit()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [usage, setUsage] = useState<Map<string, ExerciseUsageRow>>(new Map())
  const [selected, setSelected] = useState<Exercise | null>(null)
  // The series carries the exercise it belongs to, so switching exercises does
  // not need an effect to clear the old points — they simply stop matching.
  const [series, setSeries] = useState<{
    exerciseId: string
    points: OneRepMaxPoint[]
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
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
      const initial = mostRecent
        ? (list.find((e) => e.id === mostRecent.exercise_id) ?? null)
        : null
      setSelected(initial)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    const exerciseId = selected.id
    let active = true
    void supabase
      .rpc('exercise_1rm_history', { p_exercise_id: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) {
          setError(describeError('Loading the trend for that exercise', rpcError))
          setSeries({ exerciseId, points: [] })
          return
        }
        setError(null)
        setSeries({ exerciseId, points: (data ?? []) as OneRepMaxPoint[] })
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

  if (loading) return <p className="py-10 text-sm text-muted">Loading…</p>

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
    <div className="flex flex-col gap-3 py-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-accent px-3 py-2 text-sm text-accent"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-line px-3 text-start"
      >
        <span className="flex-1">
          <span className="block text-xs text-muted">Exercise</span>
          <span className="block truncate text-base font-semibold">
            {selected?.name ?? 'Pick an exercise'}
          </span>
        </span>
        <span className="text-sm text-muted">Change</span>
      </button>

      {!selected ? (
        <p className="py-6 text-sm text-muted">Log a few sessions to see your trend.</p>
      ) : loadingChart ? (
        <p className="py-6 text-sm text-muted">Loading…</p>
      ) : chartData.length < 2 ? (
        <p className="py-6 text-sm text-muted">Log a few sessions to see your trend.</p>
      ) : (
        <>
          <div>
            <p className="text-xs text-muted">Estimated 1RM · latest</p>
            <p className="tnum text-4xl font-bold">
              {trim(summary?.last ?? 0)}
              <span className="ms-1 text-base font-normal text-muted">{unit}</span>
            </p>
            {summary && (
              <p className="tnum mt-1 text-sm text-muted">
                best {trim(summary.best)} · {summary.delta >= 0 ? '+' : ''}
                {trim(summary.delta)} since {formatShortDate(points[0].started_at)}
              </p>
            )}
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke="#26262a" vertical={false} />
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
                  tick={{ fill: '#8a8a92', fontSize: 11 }}
                  stroke="#26262a"
                  minTickGap={28}
                />
                <YAxis
                  width={44}
                  domain={yDomain}
                  tick={{ fill: '#8a8a92', fontSize: 11 }}
                  stroke="#26262a"
                  tickFormatter={(value: number) => String(Math.round(value))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151517',
                    border: '1px solid #26262a',
                    borderRadius: 8,
                    color: '#ececee',
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
                  stroke="#f0b429"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#f0b429' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted">
            Epley estimate from working sets: weight × (1 + reps ÷ 30). Warmups and sets
            without both weight and reps are excluded.
          </p>
        </>
      )}
    </div>
  )
}
