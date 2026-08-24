/**
 * Generate a plan.
 *
 * ── WHY THIS ROUTE EXISTS ───────────────────────────────────────────────────
 * `generate-routine` has been a deployed Edge Function since stage 2c and
 * `src/lib/ai.ts` was its only caller. That file imports the browser Supabase
 * client, so it never crossed `portable.ts`, and the app being published could
 * not reach a feature that was already built and already paid for.
 *
 * It also closes the cold start. All 18 production routines came from the Hevy
 * import and only 4 have ever been run, so an account that did not import
 * opened the Plan tab to "No routines yet" with nothing on the screen that
 * could fill it.
 *
 * ── PREVIEW, THEN KEEP ──────────────────────────────────────────────────────
 * Two states on one screen rather than two routes. The model call writes
 * NOTHING; `saveGeneratedRoutines` writes, and only when the lifter presses
 * Keep. That is CLAUDE.md's rule exactly: no model output reaches the database
 * without somebody pressing something. It is also why "Try a different one"
 * costs a generation and Keep does not — rejecting a plan should never be the
 * expensive choice on a screen whose entire point is that you can refuse it.
 *
 * A static route beside `[id].tsx`. Expo Router resolves static segments before
 * dynamic ones, so `/routine/generate` cannot be swallowed by `[id]` the way
 * `/routine/new` deliberately is.
 */

import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { equipmentLabel, radius } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { Txt } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { usePalette } from '@/hooks/use-theme'
import { tick } from '@/services/haptics'
import {
  ROUTINE_EQUIPMENT,
  ROUTINE_GOALS,
  generateRoutinePreview,
  saveGeneratedRoutines,
  type RoutineEquipment,
  type RoutineGoal,
  type RoutinePreview,
} from '@/services/routines'

const DAY_CHOICES = [2, 3, 4, 5, 6] as const

export default function GenerateRoutineScreen() {
  const { t, locale } = useLocale()
  const palette = usePalette()

  const [goal, setGoal] = useState<RoutineGoal>('muscle')
  const [days, setDays] = useState<number>(3)
  const [equipment, setEquipment] = useState<RoutineEquipment[]>([
    'barbell',
    'dumbbell',
    'machine',
  ])
  const [preview, setPreview] = useState<RoutinePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleEquipment(id: RoutineEquipment) {
    setEquipment((current) =>
      current.includes(id) ? current.filter((e) => e !== id) : [...current, id],
    )
  }

  /** Codes, not sentences, cross the service boundary; the locale lives here. */
  function messageFor(code: string): string {
    if (code === 'quota') return t('generate.quota')
    if (code === 'empty') return t('generate.empty')
    if (code === 'thin') return t('generate.thin')
    if (code === 'toolong') return t('generate.toolong')
    return t('generate.failed')
  }

  function generate() {
    if (busy) return
    if (equipment.length === 0) {
      setError(t('generate.equipment.none'))
      return
    }
    setBusy(true)
    setError(null)
    generateRoutinePreview({ goal, days, equipment })
      .then((next) => {
        setPreview(next)
        setBusy(false)
      })
      .catch((e: unknown) => {
        setBusy(false)
        setError(messageFor(e instanceof Error ? e.message : 'failed'))
      })
  }

  function keep() {
    if (busy || preview === null) return
    setBusy(true)
    setError(null)
    saveGeneratedRoutines(preview.preview)
      .then(() => {
        // Back to Plan, which re-reads on focus and will show the new rows.
        router.back()
      })
      .catch(() => {
        setBusy(false)
        setError(t('generate.failed'))
      })
  }

  const chip = (selected: boolean) => ({
    minHeight: 40,
    justifyContent: 'center' as const,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: selected ? palette.ink : palette.ring,
    backgroundColor: selected ? palette.ink : 'transparent',
  })

  return (
    <Screen>
      <View style={{ height: 56, justifyContent: 'center' }}>
        <Btn
          kind="ghost"
          small
          label={`← ${t('settings.back')}`}
          onPress={() => router.back()}
        />
      </View>

      {/* No `flex: 1` on the heading. In Arabic a flexed Text swallows the
          row's free space without putting its content on the start edge, which
          shipped twice already (`routine/[id].tsx`, `session/add.tsx`). */}
      <Txt step="title" style={{ marginTop: 8 }}>
        {t('generate.heading')}
      </Txt>
      <Txt step="body" ink="muted" style={{ marginTop: 10 }}>
        {t('generate.sub')}
      </Txt>

      {preview === null ? (
        <View style={{ gap: 22, marginTop: 26 }}>
          <View style={{ gap: 9 }}>
            <Txt step="kick" ink="muted">
              {t('generate.goal')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ROUTINE_GOALS.map((g) => (
                <Pressable
                  key={g}
                  accessibilityRole="button"
                  accessibilityState={{ selected: goal === g }}
                  onPress={() => setGoal(g)}
                  style={chip(goal === g)}
                >
                  <Txt step="meta" ink={goal === g ? 'onInk' : 'muted'}>
                    {t(`goal.${g}`)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 9 }}>
            <Txt step="kick" ink="muted">
              {t('generate.days')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DAY_CHOICES.map((d) => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: days === d }}
                  onPress={() => setDays(d)}
                  style={chip(days === d)}
                >
                  <Txt step="meta" ink={days === d ? 'onInk' : 'muted'}>
                    {String(d)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 9 }}>
            <Txt step="kick" ink="muted">
              {t('generate.equipment')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ROUTINE_EQUIPMENT.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityState={{ selected: equipment.includes(e) }}
                  onPress={() => toggleEquipment(e)}
                  style={chip(equipment.includes(e))}
                >
                  <Txt step="meta" ink={equipment.includes(e) ? 'onInk' : 'muted'}>
                    {equipmentLabel(locale, e)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>

          {error !== null && (
            <Txt step="body" ink="muted">
              {error}
            </Txt>
          )}

          <Btn
            kind="hero"
            full
            disabled={busy}
            label={busy ? t('generate.working') : t('generate.action')}
            onPress={generate}
          />
          {busy && <ActivityIndicator color={palette.muted} />}
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 26 }}>
          <Txt step="kick" ink="muted">
            {t('generate.preview')}
          </Txt>

          {preview.preview.map((day, dayIndex) => (
            /* Keyed by INDEX, not by name. `generate-routine`'s system prompt
               says "6 days = push/pull/legs run twice", so a six-day plan comes
               back as Push, Pull, Legs, Push, Pull, Legs and the name collided
               three times. React logged a duplicate-key warning and could bind
               the wrong Card to the wrong day on any re-render. The list is
               never reordered, so the index is a stable identity here. */
            <Card key={dayIndex} style={{ gap: 10 }}>
              <Txt step="label">{day.name}</Txt>
              <View style={{ gap: 8 }}>
                {day.exercises.map((e, i) => (
                  /* Same defect one level down: a model that lists a lift
                     twice in one day collided on `e.id`. */
                  <View key={`${dayIndex}-${i}`}>
                    {i > 0 && <Rule />}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        paddingTop: i > 0 ? 8 : 0,
                      }}
                    >
                      {/* `flexShrink`, not `flex`: bounded without claiming the
                          free space, so a long lift name cannot push the set
                          count off the start edge in Arabic. */}
                      <Txt step="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {e.name}
                      </Txt>
                      <Txt step="meta" ink="muted">
                        {t('generate.sets', {
                          sets: String(e.sets),
                          reps: String(e.reps),
                        })}
                      </Txt>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ))}

          {/* Stated, never hidden. A plan that quietly lost two lifts is a plan
              the lifter will find a hole in mid-workout. */}
          {preview.droppedExercises.length > 0 && (
            <Txt step="meta" ink="muted">
              {t('generate.dropped')}
            </Txt>
          )}

          {error !== null && (
            <Txt step="body" ink="muted">
              {error}
            </Txt>
          )}

          <Btn
            kind="hero"
            full
            disabled={busy}
            label={busy ? t('generate.saving') : t('generate.save')}
            onPress={keep}
          />
          {/* Costs a generation, and Keep does not. Rejecting must never be the
              expensive choice on a preview screen. */}
          <Btn
            kind="line"
            full
            disabled={busy}
            label={t('generate.again')}
            onPress={() => {
              tick()
              setPreview(null)
              setError(null)
            }}
          />
        </View>
      )}
    </Screen>
  )
}
