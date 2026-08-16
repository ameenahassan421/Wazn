// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { WorkoutOverview } from './WorkoutOverview'
import type { OverviewBlock } from './WorkoutOverview'
import { buildBlock } from '@wazn/core/plan'
import type {
  Exercise,
  PreviousSessionRow,
  SetType,
  WorkoutSet,
} from '@wazn/core/types'

/**
 * What this file is defending.
 *
 * GATE U2 measures one number above all others: committing a repeat set must
 * not cost more taps than it did before the overview existed. It was one tap
 * ("Log set 3"); it is one tap here (the row's check). Everything else in the
 * design hangs off that, so it is asserted by counting clicks rather than by
 * reading the component.
 *
 * The rest is the row contract: values are read, never typed; a ghost is
 * client state until its check is pressed; the four row states are told apart
 * by fill and border, never by hue.
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
  note: string | null = null,
): OverviewBlock {
  return {
    ...buildBlock(args),
    exercise,
    note,
    restSeconds: 120,
  }
}

function renderOverview(
  blocks: OverviewBlock[],
  overrides: Record<string, unknown> = {},
) {
  const props = {
    blocks,
    unit: 'kg' as const,
    busy: false,
    onCommit: vi.fn(),
    onOpenRow: vi.fn(),
    onAddGhost: vi.fn(),
    onReorder: vi.fn(),
    onSaveNote: vi.fn(),
    onSaveRest: vi.fn(),
    onUngroup: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(<WorkoutOverview {...props} />)
  return props
}

describe('WorkoutOverview — the one-tap commit GATE U2 measures', () => {
  it('commits a ghost row exactly as shown, in one tap', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 102.5, 8)],
        previous: [previous(100, 8), previous(100, 8)],
      }),
    ])

    await user.click(
      screen.getByRole('button', {
        name: /Log Bench Press \(Barbell\) set 2: 102\.5 × 8/,
      }),
    )

    expect(props.onCommit).toHaveBeenCalledTimes(1)
    const [exerciseId, row] = props.onCommit.mock.calls[0]
    expect(exerciseId).toBe(BENCH.id)
    // Exactly as shown: the values that were on screen, not a re-derivation.
    expect(row).toMatchObject({ kind: 'ghost', weightKg: 102.5, reps: 8 })
  })

  it('opens the focused view from the values, and never commits from them', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [],
        previous: [previous(100, 8)],
      }),
    ])

    await user.click(screen.getByRole('button', { name: /Open to edit/ }))

    expect(props.onOpenRow).toHaveBeenCalledTimes(1)
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('has no text input anywhere — typing belongs to the focused view', () => {
    renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [previous(100, 8)] }),
    ])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('offers no "complete all" — that would log a workout nobody did', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [],
        previous: [previous(100, 8), previous(100, 8), previous(100, 8)],
      }),
    ])
    expect(screen.queryByRole('button', { name: /all/i })).not.toBeInTheDocument()
  })

  it('will not commit a row with no reps — the values are the way in', () => {
    renderOverview([block(BENCH, { exerciseId: BENCH.id, sets: [] })])
    expect(screen.getByRole('button', { name: /needs reps/ })).toBeDisabled()
    expect(screen.getByText('Tap the numbers to enter your first set.')).toBeVisible()
  })
})

describe('WorkoutOverview — the row-state ladder', () => {
  it('marks a committed row as logged rather than as a control', () => {
    renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [set('s1', BENCH.id, 102.5, 8)] }),
    ])
    // A committed row has nothing to press: per-set correction is a documented
    // non-goal, so a dead button would be worse than a mark.
    expect(screen.getByRole('img', { name: 'Logged' })).toBeVisible()
  })

  it('badges a record and leaves an ordinary set alone', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [
          set('s1', BENCH.id, 100, 8),
          set('s2', BENCH.id, 107.5, 5, { pr_e1rm: true }),
        ],
      }),
    ])
    expect(screen.getAllByTitle('Personal record')).toHaveLength(1)
  })

  it('shows the previous ghost on a planned row and the comparison on a done one', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 102.5, 8)],
        previous: [previous(100, 8), previous(100, 8)],
      }),
    ])
    expect(screen.getByLabelText('Up 2.5 kg on last session')).toBeVisible()
    expect(screen.getByLabelText('Last session: 100 × 8')).toBeVisible()
  })

  it('shows the exercise image on the board, like every other surface', () => {
    renderOverview([block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [] })])
    // ExerciseThumb renders the initial tile when there is no image_url, so
    // assert the thumb is present rather than asserting on an <img>.
    const header = screen.getByRole('heading', { name: BENCH.name })
    expect(header.parentElement?.querySelector('span[style]')).toBeTruthy()
  })

  /**
   * Regression: the mirror must wrap the glyph, not the numbers.
   *
   * `icon-start` applies `scaleX(-1)` under `[dir='rtl']`, and it used to sit
   * on the span containing "↺ 100 × 8". In Arabic that rendered the weights and
   * reps backwards on every planned row of the logging board, which is the hot
   * path. Nothing in the wall caught it; a screenshot did.
   */
  it('mirrors the ghost glyph without mirroring the numbers', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [],
        previous: [previous(100, 8)],
      }),
    ])

    const ghost = screen.getByLabelText('Last session: 100 × 8')
    expect(ghost.className).not.toContain('icon-start')

    const mirrored = ghost.querySelector('.icon-start')
    expect(mirrored?.textContent?.trim()).toBe('↺')
    expect(mirrored?.textContent).not.toMatch(/[0-9]/)
    expect(ghost.textContent).toContain('100 × 8')
  })

  it('never marks a lighter day as an error — down is muted, not red', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 97.5, 8)],
        previous: [previous(100, 8)],
      }),
    ])
    const down = screen.getByLabelText('Down 2.5 kg on last session')
    expect(down).toBeVisible()
    expect(down.className).toContain('text-muted')
    expect(down.className).not.toContain('accent')
  })

  it('rings the row the focused view is open on', () => {
    const { container } = render(
      <WorkoutOverview
        blocks={[
          block(BENCH, {
            exerciseId: BENCH.id,
            sets: [],
            previous: [previous(100, 8)],
          }),
        ]}
        unit="kg"
        busy={false}
        editingKey={`ghost:${BENCH.id}:0`}
        onCommit={vi.fn()}
        onOpenRow={vi.fn()}
        onAddGhost={vi.fn()}
        onReorder={vi.fn()}
        onSaveNote={vi.fn()}
        onSaveRest={vi.fn()}
        onUngroup={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const ringed = container.querySelector('[style*="var(--color-accent)"]')
    expect(ringed).not.toBeNull()
  })
})

describe('WorkoutOverview — the block header', () => {
  it('gives the name the whole line and puts progress on the meta line', () => {
    renderOverview([
      block(
        BENCH,
        {
          exerciseId: BENCH.id,
          sets: [set('s1', BENCH.id, 102.5, 8)],
          previous: [previous(100, 8), previous(100, 8), previous(100, 8)],
        },
        'seat position 4',
      ),
    ])
    const heading = screen.getByRole('heading', { name: 'Bench Press (Barbell)' })
    expect(heading).toBeVisible()
    expect(screen.getByText('1 / 3')).toBeVisible()
    expect(screen.getByText('seat position 4')).toBeVisible()
  })

  it('offers another row only once the plan is done', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 100, 8)],
        previous: [previous(100, 8)],
      }),
    ])
    await user.click(screen.getByRole('button', { name: '+ Add set' }))
    expect(props.onAddGhost).toHaveBeenCalledWith(BENCH.id)
  })
})

describe('WorkoutOverview — supersets and reordering', () => {
  it('draws one rail and names the round for adjacent group members', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 100, 8, { superset_group: 1 })],
        previous: [previous(100, 8), previous(100, 8), previous(100, 8)],
        supersetGroup: 1,
      }),
      block(ROW, {
        exerciseId: ROW.id,
        sets: [],
        previous: [previous(70, 10), previous(70, 10), previous(70, 10)],
        supersetGroup: 1,
      }),
    ])
    // Round 1, because a round is not done until every member has finished it.
    expect(screen.getByText('Superset · round 1 of 3')).toBeVisible()
  })

  it('reorders from the menu, so the drag is not the only way', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [previous(100, 8)] }),
      block(ROW, { exerciseId: ROW.id, sets: [], previous: [previous(70, 10)] }),
    ])

    await user.click(screen.getByRole('button', { name: /More for Bench/ }))
    await user.click(screen.getByRole('button', { name: 'Move down' }))

    expect(props.onReorder).toHaveBeenCalledWith([ROW.id, BENCH.id])
  })

  it('cannot move the first block up or the last block down', async () => {
    const user = userEvent.setup()
    renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [previous(100, 8)] }),
      block(ROW, { exerciseId: ROW.id, sets: [], previous: [previous(70, 10)] }),
    ])
    await user.click(screen.getByRole('button', { name: /More for Bench/ }))
    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled()
  })

  it('arms removal rather than deleting a session on one tap', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [set('s1', BENCH.id, 100, 8)],
        previous: [previous(100, 8)],
      }),
    ])

    await user.click(screen.getByRole('button', { name: /More for Bench/ }))
    const remove = screen.getByRole('button', { name: 'Remove exercise' })
    await user.click(remove)
    expect(props.onRemove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove and delete sets?' }))
    expect(props.onRemove).toHaveBeenCalledWith(BENCH.id)
  })

  it('offers un-superset only to a grouped block', async () => {
    const user = userEvent.setup()
    renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [previous(100, 8)] }),
    ])
    await user.click(screen.getByRole('button', { name: /More for Bench/ }))
    expect(
      screen.queryByRole('button', { name: 'Un-superset' }),
    ).not.toBeInTheDocument()
  })

  it('sets a per-lift rest without leaving the board', async () => {
    const user = userEvent.setup()
    const props = renderOverview([
      block(BENCH, { exerciseId: BENCH.id, sets: [], previous: [previous(100, 8)] }),
    ])
    await user.click(screen.getByRole('button', { name: /More for Bench/ }))
    await user.click(screen.getByRole('button', { name: 'Longer rest for this lift' }))
    expect(props.onSaveRest).toHaveBeenCalledWith(BENCH.id, 135)
  })
})

describe('WorkoutOverview — warm-ups', () => {
  it('shows a logged warm-up without letting it take a working number', () => {
    renderOverview([
      block(BENCH, {
        exerciseId: BENCH.id,
        sets: [
          set('s0', BENCH.id, 60, 10, { set_type: 'warmup' }),
          set('s1', BENCH.id, 100, 8),
        ],
        previous: [previous(100, 8), previous(100, 8)],
      }),
    ])
    expect(screen.getAllByTitle('Warm-up set')).toHaveLength(1)
    // The working sets still number from 1, and the second is planned.
    expect(
      screen.getByRole('button', { name: /Bench Press \(Barbell\) set 1:/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Log Bench Press \(Barbell\) set 2:/ }),
    ).toBeVisible()
  })
})
