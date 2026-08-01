// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetEntry } from './SetEntry'
import type { Exercise, PreviousSessionRow, WorkoutSet } from '../lib/types'
import type { Unit } from '../lib/units'

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
    onBack: vi.fn(),
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

    await user.click(screen.getByRole('button', { name: /Log set/ }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the reps you did. Weight can stay empty for bodyweight sets.',
    )
    expect(onAddSet).not.toHaveBeenCalled()
  })

  it('logs a bodyweight set with reps only', async () => {
    const user = userEvent.setup()
    const { onAddSet, reps } = setup()

    await user.type(reps(), '9')
    await user.click(screen.getByRole('button', { name: /Log set/ }))

    expect(onAddSet).toHaveBeenCalledWith({ weightKg: null, reps: 9 })
  })

  it('stores the typed display weight as kilograms', async () => {
    const user = userEvent.setup()
    const { onAddSet, weight, reps } = setup()

    await user.type(weight(), '135')
    await user.type(reps(), '5')
    await user.click(screen.getByRole('button', { name: /Log set/ }))

    expect(onAddSet).toHaveBeenCalledWith({ weightKg: 61.23, reps: 5 })
  })

  it('keeps the values after logging so the next set is pre-filled', async () => {
    const user = userEvent.setup()
    const { weight, reps } = setup()

    await user.type(weight(), '135')
    await user.type(reps(), '5')
    await user.click(screen.getByRole('button', { name: /Log set/ }))

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
