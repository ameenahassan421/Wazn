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
import { SET_BAND, bandState, underBand, weeklyVolume } from '../lib/progress'
import type { MuscleGroupSets, SessionVolumeRow, VolumeWeek } from '../lib/progress'

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

  const weeks = useMemo(() => weeklyVolume(sessions, 12), [sessions])

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

      {!empty && <VolumeTrend weeks={weeks} unit={unit} />}

      {!empty && (
        <StrengthList
          rows={strength}
          unit={unit}
          onOpen={(id) => {
            const found = exercises.find((e) => e.id === id)
            if (found) setDetail(found)
          }}
        />
      )}

      {empty && (
        <p className="text-sm text-muted">
          Log a workout to load the bar. Every chart here is built from your own sets —
          nothing on this screen is a sample.
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

/* ── Volume trend ─────────────────────────────────────────────────────── */

/**
 * v2 chart grammar, hand-rolled: amber 2px line, 8% area fill, dashed 2/4
 * gridlines, a dot on the last point. Not recharts — this is three paths, and
 * recharts was half the bundle on a screen the Log tab must never wait for.
 */
function VolumeTrend({ weeks, unit }: { weeks: VolumeWeek[]; unit: Unit }) {
  const W = 320
  const H = 96
  const max = Math.max(1, ...weeks.map((w) => w.volumeKg))
  const step = weeks.length > 1 ? W / (weeks.length - 1) : W
  const points = weeks.map((w, i) => ({
    x: i * step,
    y: H - (w.volumeKg / max) * (H - 8) - 4,
  }))
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const last = points.at(-1)

  return (
    <section>
      <h2 className="kicker mb-2.5">Volume · last {weeks.length} weeks</h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height: H }}
        role="img"
        aria-label={`Weekly volume, peaking at ${formatWeight(max, unit)}`}
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
      <p className="tnum mt-1 text-[11px] text-muted">
        peak {formatWeight(max, unit)} · this week{' '}
        {formatWeight(weeks.at(-1)?.volumeKg ?? 0, unit)}
      </p>
    </section>
  )
}

/* ── Strength list ────────────────────────────────────────────────────── */

function StrengthList({
  rows,
  unit,
  onOpen,
}: {
  rows: StrengthRow[]
  unit: Unit
  onOpen: (exerciseId: string) => void
}) {
  return (
    <section>
      <h2 className="kicker mb-2">Strength · est. 1RM</h2>
      <ul>
        {rows.slice(0, 12).map((row, i) => {
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
