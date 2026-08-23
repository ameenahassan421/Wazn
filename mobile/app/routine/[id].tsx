import { useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { radius, space } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Field } from '@/components/ui/Field'
import { Screen } from '@/components/ui/Screen'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { tick } from '@/services/haptics'
import { deleteRoutine, loadDraft, saveRoutine } from '@/services/routines'
import { usePalette } from '@/hooks/use-theme'
import {
  MAX_SETS,
  MIN_SETS,
  beginDraft,
  draftIsSavable,
  moveDraftExercise,
  removeDraftExercise,
  renameDraft,
  setDraftSets,
  useRoutineDraft,
} from '@/state/routine-draft'

/**
 * Screen: the routine editor. `/routine/new` creates, `/routine/<id>` edits.
 *
 * ── WHY THIS IS THE HALF THAT WAS MISSING ───────────────────────────────────
 * The Plan tab reads 386 rows of routines and, since the keystone landed, can
 * start one. Every one of those rows came from the Hevy import. Nothing in
 * either app has ever written a routine, so an account that did not import
 * from Hevy had a Plan tab that could only ever say "No routines yet" and a
 * coach whose rotation had nothing to rotate.
 *
 * ── A NAME, A LIST, AND A COUNT ─────────────────────────────────────────────
 * There is no weight field and no rep field, and their absence is the design
 * rather than a stage of it. `startWorkout(routineId)` takes STRUCTURE from
 * the routine and VALUES from the lifter's real history, on the grounds that a
 * number typed into a form months ago and rendered under "last time" would be
 * the app inventing a history. `routinePlan` selects one column off
 * `routine_sets` and counts the rows; everything else there is written and
 * never read. Offering a weight field would be offering control over a value
 * with no consumer.
 *
 * ── SAVE IS ONE PRESS AND IT IS THE ONLY WAY OUT WITH CHANGES ───────────────
 * No autosave. The children are replaced wholesale on every write (see
 * `saveRoutine`), so an autosaving editor would rewrite three tables on every
 * keystroke of the name field, and a half-typed name would be what the coach
 * reads if the app died mid-edit.
 */

/** The compact stepper. The `Stepper` on the board is a Card with its own
 *  label and is far too tall for a list row, so this is the same two keys at
 *  the row scale: 34 drawn, 48 pressed through `hitSlop`. */
function Steps({
  value,
  label,
  onChange,
}: {
  value: number
  label: string
  onChange: (next: number) => void
}) {
  const palette = usePalette()
  const base = {
    width: 34,
    height: 34,
    borderRadius: radius.ctl,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.ring,
    alignItems: 'center',
    justifyContent: 'center',
  } as const
  const slop = Math.round((space.touch - 34) / 2)
  /*
   * The keys go dead AT the bounds, and they did not until the review.
   * `setDraftSets` clamps to 1..12, so a minus press on a one-set lift ticked
   * the haptic, depressed the key and changed nothing. A lifter reading that
   * has no way to tell a floor from a broken button, and the obvious guess is
   * that minus is how you remove the lift. `RowAction` beside it already dims
   * to 0.3 when it cannot act; this now says the same thing the same way.
   */
  const atFloor = value <= MIN_SETS
  const atCeiling = value >= MAX_SETS

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="−"
        accessibilityState={{ disabled: atFloor }}
        disabled={atFloor}
        hitSlop={slop}
        onPress={() => {
          tick()
          onChange(value - 1)
        }}
        // Static, never `({ pressed }) => ...`. See the long note in `Btn.tsx`.
        style={[base, atFloor ? { opacity: 0.3 } : null]}
      >
        <Txt step="pill">−</Txt>
      </Pressable>
      {/* The count and its unit read as one word, so the whole thing is the
          label rather than a bare figure with "sets" floating beside it. */}
      <Txt step="pill" ink="muted" style={{ minWidth: 54, textAlign: 'center' }}>
        {label}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+"
        accessibilityState={{ disabled: atCeiling }}
        disabled={atCeiling}
        hitSlop={slop}
        onPress={() => {
          tick()
          onChange(value + 1)
        }}
        style={[base, atCeiling ? { opacity: 0.3 } : null]}
      >
        <Txt step="pill">+</Txt>
      </Pressable>
    </View>
  )
}

/** A move or remove control. Text, not a glyph: three unlabelled arrows in a
 *  row is a puzzle, and this screen is opened rarely enough that the words
 *  cost nothing. */
function RowAction({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      hitSlop={Math.round((space.touch - 20) / 2)}
      onPress={() => {
        tick()
        onPress()
      }}
      style={{ opacity: disabled === true ? 0.3 : 1 }}
    >
      <Txt step="pill" ink="muted">
        {label}
      </Txt>
    </Pressable>
  )
}

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { t } = useLocale()
  const draft = useRoutineDraft()

  const creating = id === 'new'
  /*
   * The id the store was filled FROM, rather than a `loading` boolean.
   *
   * `eslint-plugin-react-hooks` v7 fails the build on a synchronous
   * `setState` inside an effect, which is what `setLoading(true)` was, and the
   * repo's standing answer is to carry the owning id beside the data so a
   * stale value is INERT rather than cleared by an effect. `loading` is then
   * derived during render and cannot disagree with what is on screen.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /*
   * The load failed, and the form must NOT render.
   *
   * Separate from `error` because the two have different consequences. A save
   * that failed leaves a correct draft on screen and the lifter should try
   * again; a LOAD that failed leaves the module store holding whatever was in
   * it, which is the previously edited routine, complete with its id. Rendering
   * the form then shows routine A under routine B's heading, and Save writes to
   * A. `loadedFor` alone could not express this: it says which id the store was
   * filled from, and on a failure the store was not filled at all.
   */
  const [loadFailed, setLoadFailed] = useState(false)
  const loading = !creating && !loadFailed && loadedFor !== id

  /*
   * Seeded once, keyed on the id.
   *
   * The draft store outlives this screen on purpose (the picker is a separate
   * route and writes into it), which means re-entering the editor would
   * otherwise show whatever was left in it. The guard is the id rather than a
   * boolean so that opening a DIFFERENT routine reloads, while coming back
   * from the picker does not.
   */
  useEffect(() => {
    if (creating) {
      beginDraft({ routineId: null, name: '', exercises: [] })
      return
    }
    let live = true
    loadDraft(id)
      .then((found) => {
        if (!live) return
        if (found === null) {
          setError(t('routine.gone'))
          setLoadFailed(true)
          return
        }
        beginDraft(found)
        setLoadedFor(id)
      })
      .catch(() => {
        if (!live) return
        setError(t('routine.load_failed'))
        setLoadFailed(true)
      })
    return () => {
      live = false
    }
    // `t` is stable per locale and reloading on a language change is not
    // wanted: it would discard whatever is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, creating])

  async function save() {
    if (saving || !draftIsSavable(draft)) return
    setSaving(true)
    try {
      await saveRoutine(draft)
      router.back()
    } catch {
      setSaving(false)
      setError(t('routine.save_failed'))
    }
  }

  function confirmDelete() {
    /*
     * Captured HERE, not read again inside the callback. The alert can sit on
     * screen for as long as somebody stares at it, the draft store is global
     * and writable from another route, and `draft.routineId as string` would
     * have handed a null straight to `.eq('id', null)` — which matches no rows,
     * returns no error, and lets the screen navigate back as if the routine
     * had been deleted.
     */
    const routineId = draft.routineId
    const name = draft.name.trim()
    if (routineId === null) return
    /*
     * The platform dialog, not a drawn one. A destructive confirm is exactly
     * where a lifter's muscle memory should be the OS's and not this app's,
     * and `Alert` is already RTL-correct and screen-reader-correct for free.
     */
    Alert.alert(
      t('routine.delete'),
      /* The name can be blank: the field allows it and only SAVING rejects it.
         A destructive confirm that reads "Delete ?" has lost the one fact it
         exists to carry, so an unnamed routine is named by its placeholder. */
      t('routine.delete.body', { name: name === '' ? t('routine.untitled') : name }),
      [
        { text: t('exercise.cancel'), style: 'cancel' },
        {
          text: t('routine.delete.ok'),
          style: 'destructive',
          onPress: () => {
            void deleteRoutine(routineId)
              .then(() => router.back())
              .catch(() => setError(t('routine.delete_failed')))
          },
        },
      ],
    )
  }

  return (
    <Screen>
      {/* `space-between`, and the title carries NO `flex: 1`.
          The obvious build is a flexed title beside a Cancel, and it is wrong
          in Arabic: the flexed Text swallows the free space but does not put
          its content on the start edge, so the title floats in the middle-left
          of an otherwise empty row while Cancel sits beside it. Adding
          `space-between` on top changed nothing, because the flex had already
          consumed everything there was to distribute. Dropping the flex is
          what fixes it, and the result is correct in both directions.
          Seen on a simulator in Arabic; the picker had shipped with it. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingTop: 14,
          paddingBottom: 18,
        }}
      >
        {/* `flexShrink`, not `flex`. Dropping `flex: 1` fixed the RTL
            alignment and also removed the only thing bounding the title, so a
            longer translation would lay out at full width and push Cancel off
            the screen. Shrink keeps the bound without claiming the free
            space. */}
        <Txt step="cta" numberOfLines={1} style={{ flexShrink: 1 }}>
          {creating ? t('routine.new') : t('routine.edit')}
        </Txt>
        <Pressable
          accessibilityRole="button"
          hitSlop={Math.round((space.touch - 16) / 2)}
          onPress={() => router.back()}
        >
          <Txt step="pill" ink="muted">
            {t('exercise.cancel')}
          </Txt>
        </Pressable>
      </View>

      {error !== null && (
        <Card style={{ marginBottom: 14 }}>
          <Txt step="body">{error}</Txt>
        </Card>
      )}

      {/* Three states, and the third is the one that matters: a load that failed
          renders the error and NOTHING else. See `loadFailed`. */}
      {loadFailed ? null : loading ? (
        /* A blank frame on the right ground rather than a spinner, same as the
           Plan tab: this is one read and a spinner that flashes reads as jank. */
        <View style={{ height: 160 }} />
      ) : (
        <View style={{ gap: 18 }}>
          <Field
            label={t('routine.name')}
            value={draft.name}
            onChangeText={renameDraft}
            placeholder={t('routine.name.placeholder')}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
          />

          <View style={{ gap: 12 }}>
            <Kick>{t('routine.lifts')}</Kick>

            {draft.exercises.length === 0 ? (
              <Card>
                <Txt step="body" ink="muted">
                  {t('routine.no_lifts')}
                </Txt>
              </Card>
            ) : (
              <Card bare style={{ overflow: 'hidden' }}>
                {draft.exercises.map((e, i) => (
                  <View key={`${e.exerciseId}-${i}`}>
                    {i > 0 && <Rule inset={space.cardPad} />}
                    <View
                      style={{
                        paddingHorizontal: space.cardPad,
                        paddingVertical: 14,
                        gap: 12,
                      }}
                    >
                      <Txt step="label" numberOfLines={1}>
                        {/* An id the catalogue could not name still shows and
                            still saves. Dropping it would delete a row as a
                            side effect of opening this screen. */}
                        {e.name === '' ? t('routine.unnamed') : e.name}
                      </Txt>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 14,
                        }}
                      >
                        <Steps
                          value={e.sets}
                          label={
                            e.sets === 1
                              ? t('routine.sets_one')
                              : t('routine.sets', { n: String(e.sets) })
                          }
                          onChange={(next) => setDraftSets(i, next)}
                        />
                        {/* Two groups, not six controls in a line.
                            Up and Down are a pair and sit tight; Remove is
                            the destructive one and is pushed clear of them, so
                            a thumb aiming at Down cannot land on it. Seen on a
                            simulator: at an even 16px gap the three words read
                            as one undifferentiated strip. */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 26,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 14,
                            }}
                          >
                            <RowAction
                              label={t('routine.up')}
                              disabled={i === 0}
                              onPress={() => moveDraftExercise(i, -1)}
                            />
                            <RowAction
                              label={t('routine.down')}
                              disabled={i === draft.exercises.length - 1}
                              onPress={() => moveDraftExercise(i, 1)}
                            />
                          </View>
                          <RowAction
                            label={t('routine.remove')}
                            onPress={() => removeDraftExercise(i)}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            <Btn
              kind="line"
              full
              label={t('log.add_exercise')}
              /* The picker this app already has, told where to deliver. */
              onPress={() => router.push('/session/add?to=routine')}
            />
          </View>

          <View style={{ gap: 12, marginTop: 6 }}>
            <Btn
              kind="hero"
              full
              label={t('routine.save')}
              disabled={saving || !draftIsSavable(draft)}
              onPress={() => void save()}
            />
            {!creating && (
              <Btn
                kind="ghost"
                full
                label={t('routine.delete')}
                onPress={confirmDelete}
              />
            )}
          </View>
        </View>
      )}
    </Screen>
  )
}
