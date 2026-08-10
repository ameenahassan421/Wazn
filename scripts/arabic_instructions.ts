/**
 * Machine-drafted Arabic instruction steps for the F2 SEO exercise pages.
 *
 * Keyed by the ENGLISH exercise name, which is the stable identifier in
 * `build/seo/exercises.json`. Values are the Arabic rendering of that
 * exercise's `instructions` array, step for step and in the same order.
 *
 * Every string here was written by an LLM, not a native speaker. Ameen waived
 * native-speaker review, so drafted is acceptable; implying it is reviewed is
 * not. The snapshot carries a `_draft` marker for the same reason.
 *
 * WHY THIS FILE EXISTS. The instructions imported from free-exercise-db are
 * English. Rendering them on an Arabic page produced a page whose heading and
 * meta were Arabic and whose body was English, which is worse than no page:
 * Arabic search is the entire premise of F2, and a mixed-language page serves
 * neither language. An exercise with no entry here gets NO Arabic page at all,
 * rather than a thin or half-translated one.
 *
 * DO NOT import from `src/`. Build-time scripts and their tests only.
 */

export const ARABIC_INSTRUCTIONS: Record<string, string[]> = {}

/** The Arabic steps for an exercise, or null when it has not been translated. */
export function arabicInstructions(nameEn: string): string[] | null {
  const steps = ARABIC_INSTRUCTIONS[nameEn]
  return Array.isArray(steps) && steps.length > 0 ? steps : null
}
