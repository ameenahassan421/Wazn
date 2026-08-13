// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { SessionQueue } from './SessionQueue'
import type { OverviewBlock } from './WorkoutOverview'
import { buildBlock } from '../lib/plan'
import type { Exercise, PreviousSessionRow, SetType, WorkoutSet } from '../lib/types'

/**
 * What this file is defending.
 *
 * The queue is a map, not a ledger: it must agree with the overview about
 * what is done, it must say something honest when there is no plan to name,
 * and every row must be reachable by a thumb. It reads the same
 * `OverviewBlock` the overview does, so the assertions are built through
 * `buildBlock` rather than hand-shaped objects — a change to the planning
 * ladder should break these too.
 */

const BENCH: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press (Barbell)',
  muscle_group: 'chest',
  equipment: 'barbell',
  is_custom: false,
  owner_id: null,
  image_url: null,
  default_rest_seconds: null,
}

const ROW: Exercise = { ...BENCH, id: 'ex-row', name: 'Bent Over Row (Barbell)' }
const CURL: Exercise = { ...BENCH, id: 'ex-curl', name: 'Bicep Curl (Dumbbell)' }

function set(
  id: string,
  exerciseId: string,
  weight: number | null,
  reps: number,
  extra: Partial<WorkoutSet> = {},
): WorkoutSet {
  return {
    id,
    workout_id: 'w1',
    exercise_id: exerciseId,
    set_number: 1,
    weight_kg: weight,
    reps,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: 'normal' as SetType,
    superset_group: null,
    pr_weight: false,
    pr_e1rm: false,
    ...extra,
  }
}

function previous(weight: number, reps: number): PreviousSessionRow {
  return {
    workout_id: 'w0',
    started_at: '2026-08-01T18:00:00.000Z',
    set_number: 1,
    weight_kg: weight,
    reps,
    set_type: 'normal',
  }
}

function block(
  exercise: Exercise,
  args: Parameters<typeof buildBlock>[0],
): OverviewBlock {
  return { ...buildBlock(args), exercise, note: null, restSeconds: 120 }
}

/** Bench with two of three logged, a finished row, and an untouched curl. */
function session(): OverviewBlock[] {
  return [
    block(BENCH, {
      exerciseId: BENCH.id,
      sets: [set('s1', BENCH.id, 60, 5), set('s2', BENCH.id, 60, 5)],
      previous: [previous(60, 5), previous(60, 5), previous(60, 4)],
      supersetGroup: null,
      extra: 0,
    }),
    block(ROW, {
      exerciseId: ROW.id,
      sets: [set('s3', ROW.id, 70, 8)],
      previous: [previous(70, 8)],
      supersetGroup: null,
      extra: 0,
    }),
    block(CURL, {
      exerciseId: CURL.id,
      sets: [],
      previous: [previous(15, 12), previous(15, 12)],
      supersetGroup: null,
      extra: 0,
    }),
  ]
}

function renderQueue(blocks: OverviewBlock[], currentId = BENCH.id) {
  const onJump = vi.fn()
  render(<SessionQueue blocks={blocks} currentExerciseId={currentId} onJump={onJump} />)
  return { onJump }
}

describe('SessionQueue', () => {
  it('counts what is left, excluding the current lift and the finished ones', () => {
    renderQueue(session())
    // Bench is current, Row is done (1 of 1), so only the curl is to go.
    expect(screen.getByText(/1 to go/)).toBeInTheDocument()
  })

  it('shows live progress on the current lift and the scheme on an upcoming one', () => {
    renderQueue(session())
    expect(
      screen.getByRole('button', { name: /Go to Bench Press.*2\/3 sets/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Go to Bicep Curl.*2 × 12/ }),
    ).toBeInTheDocument()
  })

  it('marks a finished lift as logged rather than as a scheme', () => {
    renderQueue(session())
    expect(
      screen.getByRole('button', { name: /Go to Bent Over Row.*Logged/ }),
    ).toBeInTheDocument()
  })

  it('jumps to the lift a row names', async () => {
    const user = userEvent.setup()
    const { onJump } = renderQueue(session())
    await user.click(screen.getByRole('button', { name: /Go to Bicep Curl/ }))
    expect(onJump).toHaveBeenCalledWith(CURL.id)
  })

  it('says nothing rather than inventing a scheme for a lift with no history', () => {
    const blocks = [
      ...session().slice(0, 2),
      block(CURL, {
        exerciseId: CURL.id,
        sets: [],
        previous: [],
        supersetGroup: null,
        extra: 0,
      }),
    ]
    renderQueue(blocks)
    expect(
      screen.getByRole('button', { name: /Go to Bicep Curl.*—/ }),
    ).toBeInTheDocument()
  })

  it('marks the current row for assistive technology, not by styling alone', () => {
    renderQueue(session())
    const current = screen.getByRole('button', { name: /Go to Bench Press/ })
    expect(current).toHaveAttribute('aria-current', 'true')
  })

  it('stays out of the way when there is only one lift on the board', () => {
    const { container } = render(
      <SessionQueue
        blocks={session().slice(0, 1)}
        currentExerciseId={BENCH.id}
        onJump={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('isolates the figures so Arabic cannot reorder them', () => {
    const { container } = render(
      <SessionQueue blocks={session()} currentExerciseId={BENCH.id} onJump={vi.fn()} />,
    )
    // The bug this pins shipped once: "2 × 12" rendered backwards beside an
    // Arabic name, and only a screenshot caught it.
    for (const el of container.querySelectorAll('[dir="ltr"]')) {
      expect(el.textContent).toMatch(/[0-9—]/)
    }
    // Two figure rows (current and upcoming); the done row's "Logged" is a
    // translated word and is deliberately left to the paragraph direction.
    expect(container.querySelectorAll('[dir="ltr"]').length).toBe(2)
  })
})
