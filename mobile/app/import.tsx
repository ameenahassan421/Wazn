import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { hevy, radius } from '@wazn/domain'

import { Btn, ChipBtn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { Txt, Kick } from '@/design/Txt'
import { useAuth } from '@/hooks/use-auth'
import { useLocale } from '@/hooks/use-locale'
import { usePalette } from '@/hooks/use-theme'
import { pickHevyCsv, planFor, runImport } from '@/services/hevy'

/**
 * "Bring your history from Hevy", on native.
 *
 * ── WHY THIS IS WORTH BUILDING RATHER THAN DELETING ─────────────────────────
 * The finish-line item read "Hevy import on native, or remove the Hevy CTA
 * from `sign-in.tsx`". Deleting was the cheaper half and it was the wrong one:
 * the parse layer is already written and tested in `src/lib/hevy-import.ts`,
 * the entire copy catalogue for this screen already exists in both locales,
 * and the file picker turned out to need no new dependency at all. What was
 * missing was this screen and about 200 lines of I/O.
 *
 * It is also the best onboarding this app has. The board puts a
 * previous-session ghost on every row, and for a switcher that ghost is empty
 * until they have logged twice. With their history in, the coach has something
 * to say on day one instead of in week three.
 *
 * ── THE DOOR IS IN SETTINGS, NOT ON SIGN-IN ─────────────────────────────────
 * `sign-in.tsx` carries a Hevy card, and it stays copy-only, because it sits
 * BEFORE authentication and an import needs an account to write into. A button
 * there could only ever say "first, sign in". The card is the promise; this is
 * where it is kept.
 *
 * ── SHOW WHAT WILL HAPPEN BEFORE IT HAPPENS ─────────────────────────────────
 * The one rule the flow is built around, because the input is somebody's
 * training history. Nothing is written before the preview has been read and a
 * button pressed. The boundary is a whole workout, so a failure reports where
 * it stopped and offers to carry on. There is no silent half-write.
 */

type Phase = 'idle' | 'reading' | 'preview' | 'writing' | 'done'

/** A large tabular number over a quiet label. The app's figure pairing. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt step="fig" ltr>
        {value}
      </Txt>
      <Txt step="caption" ink="muted">
        {label}
      </Txt>
    </View>
  )
}

export default function ImportScreen() {
  const { t } = useLocale()
  const { userId } = useAuth()

  const [phase, setPhase] = useState<Phase>('idle')
  const [plan, setPlan] = useState<hevy.ImportPlan | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [written, setWritten] = useState(0)
  /**
   * Skip everything on or before this instant, or null to bring all of it.
   *
   * Held beside the plan rather than folded into it, so the file is read once
   * and the decision stays reversible: the counts below recompute as it moves.
   */
  const [cutoff, setCutoff] = useState<string | null>(null)
  /** Set by Stop, read between workouts, never mid-write. */
  const stopped = useRef(false)

  async function choose(): Promise<void> {
    setError(null)
    let picked
    try {
      picked = await pickHevyCsv()
    } catch {
      setError(t('import.error.read'))
      return
    }
    if (picked === null) return

    setPhase('reading')
    setFileName(picked.name)
    setWritten(0)
    try {
      const next = await planFor(picked.text)
      setPlan(next)
      /*
       * Default ON whenever the file reaches into a period the log already
       * covers. The safe choice is the one nobody has to notice: a lifter who
       * wants the older sessions can turn it off and watch the count change,
       * and a lifter who does not read this screen at all cannot double their
       * own history by pressing the obvious button.
       */
      setCutoff(next.overlapping > 0 ? next.latestLogged : null)
      setPhase('preview')
    } catch {
      setError(t('import.error.read'))
      setPhase('idle')
    }
  }

  /** The plan as the cutoff leaves it: what the preview counts and what the
   *  run writes, so the number on screen and the number inserted are one. */
  const shown = plan === null ? null : hevy.afterCutoff(plan, cutoff)

  function start(): void {
    if (shown === null || userId === null) return
    stopped.current = false
    setError(null)
    setPhase('writing')

    void runImport(shown, userId, {
      from: written,
      onProgress: setWritten,
      shouldStop: () => stopped.current,
      messages: {
        createExercises: t('import.error.create_exercises'),
        createWorkout: t('import.error.create_workout'),
        saveSets: t('import.error.save_sets'),
      },
    })
      .then((outcome) => {
        setWritten(outcome.done)
        if (outcome.error !== null) {
          setError(outcome.error)
          setPhase('preview')
          return
        }
        setPhase(outcome.done >= shown.workouts.length ? 'done' : 'preview')
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t('import.error.create_workout'))
        setPhase('preview')
      })
  }

  const remaining = shown === null ? 0 : shown.workouts.length - written

  return (
    <Screen>
      <View style={{ height: 56, justifyContent: 'center' }}>
        {/* Hidden while writing. Leaving mid-run does not corrupt anything —
            the boundary is a whole workout — but it strands the lifter with no
            way back to the count, and Stop is one press away. */}
        {phase !== 'writing' && (
          <Btn
            kind="ghost"
            small
            label={`← ${t('settings.back')}`}
            onPress={() => router.back()}
          />
        )}
      </View>

      {/* No `flex: 1` on this heading: a flexed Text swallows the row's free
          space in Arabic without putting its content on the start edge. Same
          trap `delete-account.tsx` and `routine/[id].tsx` both document. */}
      <Kick>{t('import.hero.title')}</Kick>
      <Txt step="title" style={{ marginTop: 6 }}>
        {t('import.hero.body')}
      </Txt>

      {error !== null && (
        <Txt
          step="label"
          ink="accentSoft"
          accessibilityRole="alert"
          style={{ marginTop: 12 }}
        >
          {error}
        </Txt>
      )}

      {(phase === 'idle' || phase === 'reading') && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card style={{ gap: 8 }}>
            <Kick>{t('import.how')}</Kick>
            {[t('import.step1'), t('import.step2'), t('import.step3')].map(
              (step, i) => (
                <View key={step} style={{ flexDirection: 'row', gap: 8 }}>
                  {/* The number is `ltr` and the sentence is not: a step
                      number is a figure, and Arabic reads the sentence in the
                      other direction around it. */}
                  <Txt step="meta" ink="muted" ltr>
                    {String(i + 1)}
                  </Txt>
                  <Txt step="body" ink="muted" style={{ flex: 1 }}>
                    {step}
                  </Txt>
                </View>
              ),
            )}
          </Card>

          <Txt step="caption" ink="muted">
            {t('import.privacy')}
          </Txt>

          <Btn
            kind="hero"
            full
            label={phase === 'reading' ? t('import.reading') : t('import.choose')}
            disabled={phase === 'reading'}
            onPress={() => void choose()}
          />
        </View>
      )}

      {phase === 'preview' && shown !== null && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card style={{ gap: 12 }}>
            <Kick>{written > 0 ? t('import.found.resuming') : t('import.found')}</Kick>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Figure value={String(remaining)} label={t('import.workouts')} />
              <Figure value={String(shown.setCount)} label={t('import.sets')} />
              <Figure
                value={String(shown.matched.length + shown.unmatched.length)}
                label={t('import.exercises')}
              />
            </View>
            {fileName !== null && (
              <Txt step="meta" ink="muted" ltr numberOfLines={1}>
                {fileName}
              </Txt>
            )}
          </Card>

          {/* The overlap decision, and it LOCKS once anything has been
              written. `from` is an index into this plan, so moving the cutoff
              mid-resume would shift every index under it and rewrite sessions
              that already landed. The web version leaves it live and has the
              same defect; here it is simply not offered any more. */}
          {plan !== null && plan.overlapping > 0 && (
            <ChipBtn
              label={t('import.skip_overlap', { count: String(plan.overlapping) })}
              selected={cutoff !== null}
              onPress={() => {
                if (written > 0) return
                setCutoff(cutoff === null ? plan.latestLogged : null)
              }}
            />
          )}

          {shown.unmatched.length > 0 && (
            <Card style={{ gap: 6 }}>
              <Kick>{t('import.will_add')}</Kick>
              <Txt step="caption" ink="muted">
                {shown.unmatched.join(' · ')}
              </Txt>
            </Card>
          )}

          {shown.problems.length > 0 && (
            <Card style={{ gap: 6 }}>
              <Kick>{t('import.worth_knowing')}</Kick>
              {shown.problems.map((problem: string) => (
                <Txt key={problem} step="caption" ink="muted">
                  {problem}
                </Txt>
              ))}
            </Card>
          )}

          {shown.fatal !== null ? (
            <Txt step="label" ink="accentSoft" accessibilityRole="alert">
              {shown.fatal}
            </Txt>
          ) : (
            <Btn
              kind="hero"
              full
              label={
                written > 0
                  ? t('import.resume', { count: String(remaining) })
                  : t('import.start', { count: String(remaining) })
              }
              disabled={remaining === 0 || userId === null}
              onPress={start}
            />
          )}

          <Btn kind="line" full label={t('import.different_file')} onPress={choose} />
        </View>
      )}

      {phase === 'writing' && shown !== null && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <Kick>{t('import.running')}</Kick>
            <Txt step="fig" ltr>
              {t('import.progress', {
                done: String(written),
                total: String(shown.workouts.length),
              })}
            </Txt>
            {/* A track and a fill, the same geometry the coach's volume bars
                use. No percentage: the two numbers above already say it, and a
                third rendering of the same fact is noise. */}
            <Progress done={written} total={shown.workouts.length} />
          </Card>

          <Btn
            kind="line"
            full
            label={t('import.stop')}
            onPress={() => {
              stopped.current = true
            }}
          />
        </View>
      )}

      {phase === 'done' && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card tone="wash" style={{ gap: 6 }}>
            <Kick ink="accentSoft">{t('import.complete')}</Kick>
            <Txt step="body" ink="muted">
              {t('import.progress', {
                done: String(written),
                total: String(written),
              })}
            </Txt>
          </Card>
          <Btn
            kind="hero"
            full
            label={t('import.start_lifting')}
            onPress={() => router.replace('/')}
          />
        </View>
      )}
    </Screen>
  )
}

/** The bar under the count. Ember on a ring track, pill ends, 6px. */
function Progress({ done, total }: { done: number; total: number }) {
  const palette = usePalette()
  const share = total === 0 ? 0 : Math.min(1, done / total)
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={{
        height: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.ring,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${share * 100}%`,
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: palette.accent,
        }}
      />
    </View>
  )
}
