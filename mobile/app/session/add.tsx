import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, radius, searchByName, space } from '@wazn/domain'

import { Card, Rule } from '@/components/ui/Surface'
import { Txt } from '@/design/Txt'
import { TYPE } from '@/design/type'
import { useLocale } from '@/hooks/use-locale'
import { tick } from '@/services/haptics'
import { fetchCatalogue, type CatalogueExercise } from '@/services/exercises'
import { addExercise } from '@/state/live-workout'

/**
 * Put a lift on the board.
 *
 * ── THE SCREEN THAT UNBLOCKS DAY ONE ────────────────────────────────────────
 * The board is seeded from the last session, so a new account's is empty and
 * there was no way to add anything to it. A new lifter could start a workout
 * and finish it without logging a set. This is the missing half.
 *
 * The prototype does not draw a picker — its demo always has a bench press —
 * so this is DERIVED rather than copied: paper ground, one white card, rows
 * separated by the hairline, the same 22px gutter every other screen uses.
 * Nothing here is invented styling; it is the same four primitives.
 *
 * ── SEARCH IS LOCAL, AND THAT IS THE POINT ──────────────────────────────────
 * The catalogue is one read and filtering happens on the device through the
 * SHARED `searchByName`, which the web picker also uses — so a search that
 * matches on one platform matches on the other. A per-keystroke round trip in
 * a basement with no signal is a picker that does not work in the one place
 * this app is used.
 */
export default function AddExercise() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useLocale()

  const [all, setAll] = useState<CatalogueExercise[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    fetchCatalogue()
      .then((rows) => {
        if (live) setAll(rows)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  const shown = useMemo(
    () => (all === null ? [] : searchByName(all, query)),
    [all, query],
  )

  function choose(exercise: CatalogueExercise) {
    tick()
    // The equipment decides whether this lift has a weight dial at all. A
    // null `weightKg` means "bodyweight" to the board, so guessing here would
    // hide the dial on a barbell lift.
    addExercise(exercise.id, exercise.name, exercise.equipment === 'bodyweight')
    router.back()
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top + 10 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: space.gutter,
          paddingBottom: 12,
        }}
      >
        <Txt step="cta" style={{ flex: 1 }}>
          {t('log.add_exercise')}
        </Txt>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
        >
          <Txt step="pill" ink="muted">
            {t('exercise.cancel')}
          </Txt>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space.gutter, paddingBottom: 12 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('exercise.search')}
          placeholderTextColor={palette.muted}
          autoCorrect={false}
          autoFocus
          accessibilityLabel={t('exercise.search')}
          style={{
            height: space.touch,
            paddingHorizontal: 16,
            borderRadius: radius.pill,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.ring,
            color: palette.ink,
            fontFamily: TYPE.body.fontFamily,
            fontSize: 16,
          }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {all === null && !failed && (
          <ActivityIndicator color={palette.muted} style={{ marginTop: 32 }} />
        )}

        {failed && (
          <Card style={{ marginTop: 8 }}>
            <Txt step="label" ink="muted">
              {t('exercise.failed')}
            </Txt>
          </Card>
        )}

        {/* Two states, not one. "No lift by that name" is a SEARCH result and
            says the catalogue is fine; an empty catalogue is not. They render
            identically if you only check `shown.length`, and on 2026-08-21 the
            picker told a lifter their search had failed when the truth was
            that `exercises` is `for select to authenticated` and this build
            has auth switched off — so an anon read returns zero rows rather
            than an error, and the app had no way to tell the difference. */}
        {all !== null && !failed && shown.length === 0 && (
          <Card style={{ marginTop: 8 }}>
            <Txt step="label" ink="muted">
              {all.length === 0 ? t('exercise.catalogue_empty') : t('exercise.none')}
            </Txt>
          </Card>
        )}

        {shown.length > 0 && (
          <Card bare style={{ overflow: 'hidden' }}>
            {shown.map((exercise, i) => (
              <View key={exercise.id}>
                {i > 0 && <Rule inset={space.cardPad} />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choose(exercise)}
                  style={{
                    minHeight: space.touch,
                    paddingHorizontal: space.cardPad,
                    paddingVertical: 12,
                    justifyContent: 'center',
                  }}
                >
                  <Txt step="label" numberOfLines={1}>
                    {exercise.name}
                  </Txt>
                  {(exercise.muscleGroup !== '' || exercise.equipment !== '') && (
                    <Txt step="meta" ink="muted" style={{ marginTop: 2 }}>
                      {[exercise.muscleGroup, exercise.equipment]
                        .filter((part) => part !== '')
                        .join(' · ')}
                    </Txt>
                  )}
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  )
}
