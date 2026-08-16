// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetEntry } from './SetEntry'
import type { Exercise, PreviousSessionRow, WorkoutSet } from '@wazn/core/types'
import type { Unit } from '@wazn/core/units'

const exercise: Exercise = {
  id: 'ex-1',
  name: 'Bench Press (Barbell)',
  muscle_group: 'chest',
  equipment: 'barbell',
  is_custom: false,
  owner_id: null,
  image_url: null,
  default_rest_seconds: null,
}

const previousSession: PreviousSessionRow[] = [
  {
    workout_id: 'w-0',
    started_at: '2026-07-14T00:01:00.000Z',
    set_number: 0,
    weight_kg: 22.68,
    reps: 12,
    set_type: 'warmup',
  },
  {
    workout_id: 'w-0',
    started_at: '2026-07-14T00:01:00.000Z',
    set_number: 2,
    weight_kg: 58.97,
    reps: 6,
    set_type: 'normal',
  },
]

function setup(overrides: Partial<Parameters<typeof SetEntry>[0]> = {}) {
  const onAddSet = vi.fn(async () => true)
  const props = {
    exercise,
    unit: 'lbs' as Unit,
    setsThisWorkout: [] as WorkoutSet[],
    previousSession: [] as PreviousSessionRow[],
    previousLoading: false,
    saving: false,
    onAddSet,
    ...overrides,
  }
  const view = render(<SetEntry {...props} />)
  const weight = () => screen.getByLabelText(/Weight/) as HTMLInputElement
  const reps = () => screen.getByLabelText('Reps') as HTMLInputElement
  return { ...view, props, onAddSet, weight, reps }
}

describe('SetEntry auto-fill', () => {
  it('waits for the previous session before seeding the inputs', async () => {
    // Regression: seeding while the fetch was still in flight marked the form
    // as seeded and the auto-fill never happened.
    const { rerender, props, weight, reps } = setup({ previousLoading: true })
    expect(weight().value).toBe('')

    rerender(
      <SetEntry {...props} previousLoading={false} previousSession={previousSession} />,
    )

    expect(weight().value).toBe('130')
    expect(reps().value).toBe('6')
  })

  it('seeds from the last set of the previous session', () => {
    const { weight, reps } = setup({ previousSession })
    expect(weight().value).toBe('130')
    expect(reps().value).toBe('6')
  })

  it('prefers a set already logged in this workout over the previous session', () => {
    const logged: WorkoutSet[] = [
      {
        id: 's-1',
        workout_id: 'w-1',
        exercise_id: exercise.id,
        set_number: 1,
        weight_kg: 61.23,
        reps: 5,
        rpe: null,
        duration_seconds: null,
        distance_meters: null,
        set_type: 'normal',
        superset_group: null,
        pr_weight: false,
        pr_e1rm: false,
      },
    ]
    const { weight, reps } = setup({ previousSession, setsThisWorkout: logged })
    expect(weight().value).toBe('135')
    expect(reps().value).toBe('5')
  })

  it('leaves the inputs empty when the exercise has never been logged', () => {
    const { weight, reps } = setup()
    expect(weight().value).toBe('')
    expect(reps().value).toBe('')
    expect(screen.getByText(/First time logging this exercise/)).toBeInTheDocument()
  })
})

describe('SetEntry unit toggle', () => {
  it('converts a typed weight instead of relabelling it', () => {
    const { rerender, props, weight } = setup({ previousSession })
    expect(weight().value).toBe('130')

    rerender(<SetEntry {...props} previousSession={previousSession} unit="kg" />)

    expect(weight().value).toBe('59')
  })
})

describe('SetEntry validation', () => {
  it('names the missing field instead of failing vaguely', async () => {
    const user = userEvent.setup()
    const { onAddSet } = setup()

    await user.click(screen.getByRole('button', { name: /Bank set/ }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the reps you did. Weight can stay empty for bodyweight sets.',
    )
    expect(onAddSet).not.toHaveBeenCalled()
  })

  it('logs a bodyweight set with reps only', async () => {
    const user = userEvent.setup()
    const { onAddSet, reps } = setup()

    await user.type(reps(), '9')
    await user.click(screen.getByRole('button', { name: /Bank set/ }))

    expect(onAddSet).toHaveBeenCalledWith({
      weightKg: null,
      reps: 9,
      setType: 'normal',
      rpe: null,
    })
  })

  it('stores the typed display weight as kilograms', async () => {
    const user = userEvent.setup()
    const { onAddSet, weight, reps } = setup()

    await user.type(weight(), '135')
    await user.type(reps(), '5')
    await user.click(screen.getByRole('button', { name: /Bank set/ }))

    expect(onAddSet).toHaveBeenCalledWith({
      weightKg: 61.23,
      reps: 5,
      setType: 'normal',
      rpe: null,
    })
  })

  it('keeps the values after logging so the next set is pre-filled', async () => {
    const user = userEvent.setup()
    const { weight, reps } = setup()

    await user.type(weight(), '135')
    await user.type(reps(), '5')
    await user.click(screen.getByRole('button', { name: /Bank set/ }))

    expect(weight().value).toBe('135')
    expect(reps().value).toBe('5')
  })
})

describe('SetEntry steppers', () => {
  it('steps weight by 5 lbs and reps by 1', async () => {
    const user = userEvent.setup()
    const { weight, reps } = setup({ previousSession })

    await user.click(screen.getByLabelText('Increase weight'))
    expect(weight().value).toBe('135')

    await user.click(screen.getByLabelText('Decrease weight'))
    expect(weight().value).toBe('130')

    await user.click(screen.getByLabelText('Increase reps'))
    expect(reps().value).toBe('7')
  })

  it('never steps below zero', async () => {
    const user = userEvent.setup()
    const { reps } = setup()

    await user.click(screen.getByLabelText('Decrease reps'))
    expect(reps().value).toBe('')
  })
})

describe('SetEntry set type and RPE', () => {
  it('cycles set type normal → warmup → failure → drop and back', async () => {
    const user = userEvent.setup()
    setup()
    const button = () => screen.getByRole('button', { name: /Tap to change/ })

    expect(button()).toHaveTextContent('Set')
    await user.click(button())
    expect(button()).toHaveTextContent('W')
    await user.click(button())
    expect(button()).toHaveTextContent('F')
    await user.click(button())
    expect(button()).toHaveTextContent('D')
    await user.click(button())
    expect(button()).toHaveTextContent('Set')
  })

  it('sends the chosen set type with the set', async () => {
    const user = userEvent.setup()
    const { onAddSet, reps } = setup()

    await user.click(screen.getByRole('button', { name: /Tap to change/ }))
    await user.type(reps(), '10')
    await user.click(screen.getByRole('button', { name: /^Bank / }))

    expect(onAddSet).toHaveBeenCalledWith(
      expect.objectContaining({ setType: 'warmup', reps: 10 }),
    )
  })

  it('keeps warmup selected for the next set but resets failure', async () => {
    // A warm-up is usually followed by another warm-up; a set to failure is
    // the last one you do. Sticky failure would mislabel the next session.
    const user = userEvent.setup()
    const { reps } = setup()
    const type = () => screen.getByRole('button', { name: /Tap to change/ })

    await user.click(type()) // warmup
    await user.type(reps(), '10')
    await user.click(screen.getByRole('button', { name: /^Bank / }))
    expect(type()).toHaveTextContent('W')

    await user.click(type()) // failure
    await user.click(screen.getByRole('button', { name: /^Bank / }))
    expect(type()).toHaveTextContent('Set')
  })

  it('names the warm-up mode on the button that logs the set', async () => {
    // The bug this closes: warm-up sticks on purpose, and a working set
    // logged three sets later inherited it and vanished from every PR and
    // chart without saying anything. The mode now rides the largest element
    // on the screen instead of a 48px chip nobody is looking at.
    const user = userEvent.setup()
    setup()

    expect(screen.getByRole('button', { name: /^Bank / })).toHaveTextContent(
      'Bank set 1',
    )

    await user.click(screen.getByRole('button', { name: /Tap to change/ }))
    expect(screen.getByRole('button', { name: /^Bank / })).toHaveTextContent(
      'Bank warm-up 1',
    )
  })

  it('does not let warm-ups consume a working-set number', () => {
    const warmups: WorkoutSet[] = [1, 2, 3].map((n) => ({
      id: `s-${n}`,
      workout_id: 'w-1',
      exercise_id: exercise.id,
      set_number: n,
      weight_kg: 40,
      reps: 8,
      rpe: null,
      duration_seconds: null,
      distance_meters: null,
      set_type: 'warmup',
      superset_group: null,
      pr_weight: false,
      pr_e1rm: false,
    }))
    setup({ setsThisWorkout: warmups })

    expect(screen.getByRole('button', { name: /^Bank / })).toHaveTextContent(
      'Bank set 1',
    )
  })

  it('drops the set type when the exercise changes', async () => {
    // Warming up on bench and then switching to rows used to carry the
    // warm-up flag across with you.
    const user = userEvent.setup()
    const { rerender, props } = setup()

    await user.click(screen.getByRole('button', { name: /Tap to change/ }))
    expect(screen.getByRole('button', { name: /Tap to change/ })).toHaveTextContent('W')

    rerender(
      <SetEntry {...props} exercise={{ ...exercise, id: 'ex-2', name: 'Row' }} />,
    )

    expect(screen.getByRole('button', { name: /Tap to change/ })).toHaveTextContent(
      'Set',
    )
  })

  it('starts RPE at 8 and clears after the last step', async () => {
    const user = userEvent.setup()
    setup()
    const rpe = () => screen.getByRole('button', { name: /RPE/ })

    expect(rpe()).toHaveTextContent('RPE')
    await user.click(rpe())
    expect(rpe()).toHaveTextContent('8')
  })

  it('does not carry RPE to the next set', async () => {
    const user = userEvent.setup()
    const { onAddSet, reps } = setup()

    await user.click(screen.getByRole('button', { name: /RPE/ }))
    await user.type(reps(), '5')
    await user.click(screen.getByRole('button', { name: /Bank set/ }))
    expect(onAddSet).toHaveBeenCalledWith(expect.objectContaining({ rpe: 8 }))

    await user.click(screen.getByRole('button', { name: /Bank set/ }))
    expect(onAddSet).toHaveBeenLastCalledWith(expect.objectContaining({ rpe: null }))
  })
})

describe('SetEntry records', () => {
  function loggedSet(over: Partial<WorkoutSet>): WorkoutSet {
    return {
      id: 's',
      workout_id: 'w-1',
      exercise_id: exercise.id,
      set_number: 1,
      weight_kg: 60,
      reps: 5,
      rpe: null,
      duration_seconds: null,
      distance_meters: null,
      set_type: 'normal',
      superset_group: null,
      pr_weight: false,
      pr_e1rm: false,
      ...over,
    }
  }

  it('badges a record set and leaves an ordinary one alone', () => {
    const { container } = setup({
      setsThisWorkout: [
        loggedSet({ id: 's-1', set_number: 1 }),
        loggedSet({ id: 's-2', set_number: 2, pr_weight: true }),
      ],
    })
    expect(screen.getAllByTitle('Personal record')).toHaveLength(1)
    expect(container.querySelectorAll('.record-flash')).toHaveLength(1)
  })

  it('flashes only the set that just landed; earlier records stay tinted', () => {
    // §2.1: nothing pulls attention mid-workout. A list that re-animates every
    // record on every render would do exactly that.
    const { container } = setup({
      setsThisWorkout: [
        loggedSet({ id: 's-1', set_number: 1, pr_weight: true }),
        loggedSet({ id: 's-2', set_number: 2, pr_e1rm: true }),
      ],
    })
    expect(container.querySelectorAll('.record-flash')).toHaveLength(1)
    expect(container.querySelectorAll('.record-row')).toHaveLength(1)
  })

  it('does not flash a trailing set that is not a record', () => {
    const { container } = setup({
      setsThisWorkout: [
        loggedSet({ id: 's-1', set_number: 1, pr_weight: true }),
        loggedSet({ id: 's-2', set_number: 2 }),
      ],
    })
    expect(container.querySelectorAll('.record-flash')).toHaveLength(0)
    expect(container.querySelectorAll('.record-row')).toHaveLength(1)
  })
})

/**
 * GATE U2 — "repeat-set commit stays 1 tap".
 *
 * The P0 plan calls this non-negotiable and says it "gets an explicit test,
 * not an eyeball", because PR 4 rebuilds the two things it depends on: the
 * steppers became full-bleed zones and the commit button became a bar. The
 * property is not that the values persist — that is tested above — it is that
 * a lifter doing 3×5 at the same load pays ONE interaction for sets 2 and 3.
 *
 * Asserted by counting interactions, not by reading the DOM: `user.click` once
 * per set, and the recorded payloads must be identical. If a future change
 * clears a field on submit, requires a re-focus, or adds a confirm step, the
 * second click stops producing a second identical set and this fails.
 */
describe('GATE U2 — a repeat set is one tap', () => {
  it('logs three identical sets with one interaction each after the first', async () => {
    const user = userEvent.setup()
    const { onAddSet, weight, reps } = setup()

    // Set 1: the lifter types the load once.
    await user.type(weight(), '135')
    await user.type(reps(), '5')
    const bank = () => screen.getByRole('button', { name: /Bank set/ })
    await user.click(bank())

    // Sets 2 and 3: one tap each, nothing else touched.
    await user.click(bank())
    await user.click(bank())

    expect(onAddSet).toHaveBeenCalledTimes(3)
    // Every call, not just the last: a bug that logs set 2 correctly and set 3
    // with a stale or cleared value is exactly what this gate is guarding.
    const expected = { weightKg: 61.23, reps: 5, setType: 'normal', rpe: null }
    for (const n of [1, 2, 3]) {
      expect(onAddSet).toHaveBeenNthCalledWith(n, expected)
    }
    // And the button still offers the fourth, pre-filled.
    expect(weight().value).toBe('135')
    expect(reps().value).toBe('5')
  })

  it('counts the set up on the bar so tap three is not tap one again', async () => {
    const user = userEvent.setup()
    setup({
      setsThisWorkout: [
        {
          id: 's-1',
          workout_id: 'w-1',
          exercise_id: 'ex-1',
          set_number: 1,
          weight_kg: 61.23,
          reps: 5,
          set_type: 'normal',
          rpe: null,
        } as WorkoutSet,
      ],
    })
    // The label is the only feedback that a tap landed when the values do not
    // change — which is exactly the repeat-set case.
    expect(screen.getByRole('button', { name: /Bank set/ })).toHaveTextContent(
      'Bank set 2',
    )
    await user.click(screen.getByRole('button', { name: /Bank set/ }))
  })
})
