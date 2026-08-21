import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'

import {
  COACH_MODES,
  MODE_BEHAVIOUR,
  QUOTA_VISIBLE_AT,
  REVIEW_SECTIONS,
  isModeReady,
  palette,
  radius,
  space,
  type CoachMode,
  type CoachNotes,
} from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Chip } from '@/components/ui/Chip'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { Plate } from '@/components/ui/Plate'
import { Txt, Kick } from '@/design/Txt'
import { useCoach } from '@/hooks/use-coach'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { fetchWeeklyReview } from '@/services/coach'
import { supabaseConfigError } from '@/services/supabase'

/**
 * Screen 15 — Coach. v5 calls it the control room, and the name is the spec:
 * this is the only tab that changes what the other five MEAN, rather than
 * showing more of what they already show.
 *
 * ── THE ORDER IS FROM v5 §15 AND THE FIRST ITEM IS FIRST FOR A REASON ───────
 * Mode selector, then the week review, then the notes, then the footer. The
 * selector leads because it is the lens: everything below it is a reading of
 * the same history, and a lifter who changes it has changed how the ghosts on
 * the board will behave tomorrow. Nothing here writes to a training table.
 *
 * ── WHAT IS BUILT AND WHAT IS NOT, AND WHY THE GAPS ARE GAPS ────────────────
 * v5 draws four things on this screen. Three are here. The fourth, **Ask the
 * coach**, is not, and it is absent rather than stubbed: it needs a
 * `coach-ask` Edge Function and `supabase/functions/` contains `coach-brief`,
 * `coach-notes`, `auth-alias` and `generate-routine`. A free-text box wired to
 * nothing is the exact defect this codebase keeps finding in its own
 * screenshots — a Save button over an empty catalogue, an "Add exercise" line
 * with nothing behind it. It arrives when the function does.
 *
 * Two smaller omissions, same rule:
 *
 *   **"Apply to week" / "Adjust"** on the review card. On the web those two
 *   buttons scroll to the routine builder and step a weekly-session target.
 *   Native has neither — no builder on this tab, and `use-coach` stores no
 *   `weeklyTarget`. Two buttons that move nothing is worse than a card that
 *   simply states the recommendation, which is what it does here.
 *
 *   **Meet prep is drawn and not selectable.** `isModeReady` is false without
 *   a meet date, and `ghost-reason` then REFUSES to seed rather than inventing
 *   a percentage — so choosing it with no date would silently stop the ghosts
 *   a lifter already relies on, with no way back but a date they cannot enter.
 *   Setting one needs `@react-native-community/datetimepicker`, which Expo
 *   pins at 9.1.0 but which is not installed and is a native module (prebuild
 *   plus pods). So the card renders exactly as v5 draws it — dashed, reading
 *   "Set meet date" — which is a labelled precondition rather than a dead
 *   control: it says what is missing instead of doing nothing quietly.
 *
 * ── THE VOLUME DIAL IS ONE CONDITION, NOT A PROP THREADED THROUGH FIVE ──────
 * `speaks` is `showsCoachSurfaces`, Full only. Under Quiet or Off this tab
 * loses the selector and the review and keeps nothing else, because on native
 * there is nothing else yet — no routine builder underneath to fall back to.
 * So Off renders the empty state, which is the coherent pure-logger answer
 * (v5 do-not-regress §6): a lifter who silenced the coach opens its tab and
 * finds it silent.
 */

/* ── The mode selector ────────────────────────────────────────────────────── */

/**
 * One mode card.
 *
 * The active one takes a 2px ember ring and an "Active" chip; v5 §15 specifies
 * `0 0 0 2px em` and this is that, as a border rather than a shadow, because
 * React Native has no ring and a shadow would lift the card off the paper.
 * `dashed` is meet prep's undated state, and it is the only dashed border in
 * the app.
 */
function ModeCard({
  mode,
  active,
  dashed,
  detail,
  onPress,
}: {
  mode: CoachMode
  active: boolean
  dashed: boolean
  /** The right-hand label: "Active", "Set meet date", "6 wk out". */
  detail: string | null
  onPress: (() => void) | null
}) {
  const { t } = useLocale()
  const [pressed, setPressed] = useState(false)
  const behaviour = MODE_BEHAVIOUR[mode]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: onPress === null }}
      disabled={onPress === null}
      // Never a `style` callback. `eslint.config.js` fails the build on it and
      // CLAUDE.md records why: it was silently dropped once and rendered every
      // button in this app invisible for three days.
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress ?? undefined}
      style={{
        borderRadius: radius.card,
        padding: space.cardPad,
        backgroundColor: dashed ? 'transparent' : palette.card,
        borderWidth: active ? 2 : 1.5,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: active ? palette.accent : palette.ring,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt step="cta" style={{ flex: 1 }}>
          {t(behaviour.titleKey)}
        </Txt>
        {detail !== null && <Chip>{detail}</Chip>}
      </View>
      <Txt step="label" ink="muted" style={{ marginTop: 4 }}>
        {t(behaviour.bodyKey)}
      </Txt>
    </Pressable>
  )
}

/* ── The screen ───────────────────────────────────────────────────────────── */

export default function CoachTab() {
  const { t } = useLocale()
  const { unit } = useUnit()
  const { mode, setMode, speaks } = useCoach()

  const [notes, setNotes] = useState<CoachNotes | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [force, setForce] = useState(false)

  /**
   * `t` changes identity with the locale and the effect below fetches, so it
   * rides in a ref rather than the dependency array: a language toggle must
   * not spend a model call. Assigned in an effect, never during render.
   */
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  /**
   * `loading` is set by whatever CAUSES a fetch — the initial state, or the
   * Regenerate handler — and never inside the effect. `react-hooks` v7 forbids
   * synchronous setState in an effect body, and it is right to: the effect's
   * job is the request, not the spinner.
   *
   * `unit` is a real dependency. The review quotes e1RM figures, so it is
   * written in whichever unit the reader is on; the function caches per unit,
   * so returning to one already seen costs nothing.
   */
  useEffect(() => {
    if (supabaseConfigError !== null || !speaks) return
    let active = true
    void (async () => {
      try {
        const result = await fetchWeeklyReview(unit, { force })
        if (!active) return
        setNotes(result)
        setState('ready')
      } catch (error) {
        if (!active) return
        setMessage(
          error instanceof Error
            ? error.message
            : tRef.current('coach.notes.unavailable'),
        )
        setState('failed')
      }
    })()
    return () => {
      active = false
    }
    // `force` is part of the key on purpose: Regenerate is a new request, not
    // a re-render of the old one.
  }, [reload, force, unit, speaks])

  const review = notes?.review ?? null
  const left = notes?.regeneratesLeft ?? null
  const spent = left !== null && left <= 0

  /* The recommendation is the row to ACT on, so v5 gives it its own card; the
     other four are the numbered notes. Same five sections the function has
     always returned, read into the shape the design draws — no second call. */
  const recommendation = review?.sections?.recommendation ?? null
  const noteKeys = REVIEW_SECTIONS.filter((key) => key !== 'recommendation')

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.coach')}</Kick>

      {/* ── Mode ─────────────────────────────────────────────────────────
          Gated on `speaks`, like every other coach surface. A mode is only
          meaningful while the coach is allowed to act on it. */}
      {speaks && (
        <View style={{ gap: 10, marginBottom: space.gutter }}>
          <Kick>{t('mode.kicker')}</Kick>
          {COACH_MODES.map((id) => {
            // No meet date is stored on native yet, so `isModeReady` is the
            // whole gate: it is true for the two modes that need nothing and
            // false for meet prep until a date exists.
            const ready = isModeReady(id, null)
            return (
              <ModeCard
                key={id}
                mode={id}
                active={mode === id}
                dashed={!ready}
                detail={
                  !ready ? t('mode.set_date') : mode === id ? t('mode.active') : null
                }
                onPress={ready ? () => setMode(id) : null}
              />
            )
          })}
        </View>
      )}

      {/* ── The week review ──────────────────────────────────────────────
          One card, three states, and no fourth: a screen that renders nothing
          is indistinguishable from one still loading, which is why
          `fetchWeeklyReview` is the only read in `services/coach.ts` that
          throws. */}
      {!speaks ? (
        <Empty line={t('coach.quiet')} />
      ) : state === 'loading' ? (
        <Card>
          {/* A kicker, not a skeleton. v2.1's rule and it still holds: a
              shimmer implies a layout is arriving; this is waiting on a
              sentence, and the layout it lands in is one line. */}
          <Kick>{t('coach.loading')}</Kick>
          <Txt step="label" ink="muted" style={{ marginTop: 6 }}>
            {t('coach.loading.body')}
          </Txt>
        </Card>
      ) : state === 'failed' ? (
        <Card style={{ gap: 12 }}>
          <Txt step="body">{message ?? t('coach.notes.unavailable')}</Txt>
          <Btn
            kind="line"
            small
            label={t('coach.retry')}
            onPress={() => {
              setState('loading')
              // `setForce(false)` matters and is not tidiness. `force` is
              // sticky state: once Regenerate sets it, every later reload
              // carries it, so a lifter who pressed Regenerate once and then
              // hit Try again three times would spend four model calls and
              // four slices of quota recovering from one failure. Retry means
              // "load it again" and is entitled to the cache; Regenerate is
              // the only control allowed to spend a call.
              setForce(false)
              setReload((n) => n + 1)
            }}
          />
        </Card>
      ) : review === null ? (
        // Nothing to say yet, which on a young account is the honest answer
        // and on this one would mean the function declined. Either way it is
        // an absence, not an error.
        <Empty line={t('coach.empty')} />
      ) : (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Kick style={{ flex: 1 }}>{t('coach.week_review')}</Kick>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: spent }}
                disabled={spent}
                hitSlop={Math.round((space.touch - 14) / 2)}
                onPress={() => {
                  setState('loading')
                  setForce(true)
                  setReload((n) => n + 1)
                }}
              >
                <Kick ink={spent ? 'muted' : 'accentSoft'}>
                  {t('coach.regenerate')}
                </Kick>
              </Pressable>
            </View>

            {review.headline !== '' && <Txt step="title">{review.headline}</Txt>}

            {recommendation?.line !== undefined && (
              <>
                <View
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                >
                  <Plate size={30} variant="hub" color={palette.ink} />
                  <Txt step="body" style={{ flex: 1 }}>
                    {recommendation.line}
                  </Txt>
                </View>
                {/* "No chip, no claim." The chip is where the sentence gets
                    pinned to a number the reader can check on Progress, and it
                    renders only when the function actually sent one. */}
                {recommendation.chip !== undefined && (
                  <Chip>{recommendation.chip}</Chip>
                )}
              </>
            )}
          </Card>

          {/* ── Coach's notes ────────────────────────────────────────────
              The other four sections, numbered, behind an ember rail. v5
              draws a 3px inline-start border; `borderStartWidth` rather than
              `borderLeftWidth`, because this app grows an Arabic locale and
              the rail has to follow the text. */}
          {noteKeys.some((key) => review.sections?.[key]?.line) && (
            <Card
              bare
              style={{
                // v5 §15's 3px ember rail. `borderStartWidth`, not
                // `borderLeftWidth`: this app grows an Arabic locale and the
                // rail has to follow the text to the other side. Written into
                // the comment above before it was written into the code, which
                // is its own small lesson — read the screenshot, not the note.
                borderStartWidth: 3,
                borderStartColor: palette.accent,
              }}
            >
              {noteKeys.map((key, index) => {
                const section = review.sections?.[key]
                if (!section?.line) return null
                return (
                  <View key={key}>
                    {index > 0 && <Rule inset={space.cardPad} />}
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 12,
                        padding: space.cardPad,
                      }}
                    >
                      {/* The index in mono — this IS the machine voice doing
                          the one job it is for, which is counting. */}
                      <Txt step="meta" ink="muted" ltr>
                        {String(index + 1).padStart(2, '0')}
                      </Txt>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Kick>{t(`coach.review.section.${key}`)}</Kick>
                        <Txt step="body">{section.line}</Txt>
                        {section.chip !== undefined && <Chip>{section.chip}</Chip>}
                      </View>
                    </View>
                  </View>
                )
              })}
            </Card>
          )}
        </View>
      )}

      {/* ── The footer ───────────────────────────────────────────────────
          One per screen, not one per surface: the disclaimer is about the
          tab, and repeating it would make it decoration.

          The quota joins it only once it is worth saying. The limits were
          lifted to ~500 loop backstops, so "500 regenerates left" is
          furniture that invites a reader to manage a budget nobody has.
          `QUOTA_VISIBLE_AT` is 3, which is also the number v5 draws in its
          mock — the design and that decision agree, and the line renders
          exactly as drawn at the moment it starts to mean something. */}
      <Txt step="nano" ink="muted" style={{ textAlign: 'center', marginTop: 18 }}>
        {[
          t('coach.footer'),
          left === null || left > QUOTA_VISIBLE_AT
            ? null
            : t('coach.footer.quota', { n: String(left) }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Txt>
    </Screen>
  )
}
