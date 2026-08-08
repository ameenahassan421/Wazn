import type { MuscleGroup } from './types'

/**
 * Guessing a muscle group and equipment from an exercise name.
 *
 * Needed by the Hevy import and nowhere else. Every other route to a custom
 * exercise asks the user, which is better — `NewExercise` shows all eleven
 * groups and it costs one tap. An import cannot: a switcher's export can carry
 * thirty lifts this app has never heard of, and thirty questions between "open
 * the file" and "see your history" is not an onboarding, it is a form.
 *
 * So it guesses, and the guess is allowed to be wrong in a way that matters
 * only a little. A wrong group shifts one lift's contribution on the
 * muscle-balance chart; a refused import loses the history entirely. The
 * default is `core` rather than a popular group like chest, precisely so a
 * mis-grouped lift does not quietly inflate the number a user is most likely
 * to be reading.
 *
 * Ordering is deliberate: the more specific pattern is tested first, because
 * "Leg Curl" is hamstrings and "Leg Press" is quads, and both contain "leg".
 */

const PATTERNS: [RegExp, MuscleGroup][] = [
  // Cardio first — a treadmill "run" must not be read as a leg exercise.
  [
    /tread|run|jog|cycl|bike|row(ing)?\s*(machine|erg)|elliptic|stair|swim|walk/i,
    'cardio',
  ],

  [/calf|calves|toe\s*press/i, 'calves'],
  [/glute|hip\s*thrust|kickback|abduct/i, 'glutes'],
  [/hamstring|leg\s*curl|nordic|romanian|rdl|good\s*morning/i, 'hamstrings'],
  [
    /quad|squat|leg\s*press|lunge|leg\s*extension|split\s*squat|step[-\s]*up|hack/i,
    'quads',
  ],

  [/tricep|pushdown|push[-\s]*down|skull|overhead\s*extension|dip/i, 'triceps'],
  [/bicep|curl|chin[-\s]*up|preacher|hammer/i, 'biceps'],
  [
    /shoulder|delt|lateral\s*raise|front\s*raise|overhead\s*press|military|upright\s*row|shrug|face\s*pull/i,
    'shoulders',
  ],
  [/chest|bench|pec|fly|flye|push[-\s]*up/i, 'chest'],
  [/back|lat\b|pulldown|pull[-\s]*down|pull[-\s]*up|row|deadlift|pullover/i, 'back'],

  [
    /ab\b|abs\b|core|plank|crunch|sit[-\s]*up|oblique|russian\s*twist|leg\s*raise/i,
    'core',
  ],
]

export function deriveMuscleGroup(name: string): MuscleGroup {
  for (const [pattern, group] of PATTERNS) {
    if (pattern.test(name)) return group
  }
  return 'core'
}

/**
 * The same suffix convention the seed catalogue uses — Hevy writes the
 * equipment in parentheses, and an imported name keeps it.
 */
export function deriveEquipment(name: string, group: MuscleGroup): string {
  const suffix = name.match(/\(([^)]+)\)\s*$/)?.[1] ?? ''
  if (/barbell/i.test(suffix)) return 'barbell'
  if (/dumbbell/i.test(suffix)) return 'dumbbell'
  if (/cable/i.test(suffix)) return 'cable'
  if (/machine|smith/i.test(suffix)) return 'machine'
  return group === 'cardio' ? 'other' : 'bodyweight'
}
