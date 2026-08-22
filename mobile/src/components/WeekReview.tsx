import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'

import {
  QUOTA_VISIBLE_AT,
  palette,
  space,
  type CoachNotes as CoachNotesPayload,
  type ReviewBlock,
} from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { CoachNotes } from '@/components/CoachNotes'
import { Card } from '@/components/ui/Surface'
import { Chip } from '@/components/ui/Chip'
import { Plate } from '@/components/ui/Plate'
import { Txt, Kick } from '@/design/Txt'
import { useCoach } from '@/hooks/use-coach'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { fetchReviewBlock, fetchWeeklyReview } from '@/services/coach'
import { supabaseConfigError } from '@/services/supabase'

/**
 * The week in review: the coach's reading, and the figures under it.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A TAB ───────────────────────────────────
 * It was the Coach tab. `docs/FRIENDS_PLAN.md` Part 3B retires that tab, and
 * the argument is the repo's own doctrine turned on itself: AI arriving as a
 * destination is the mistake this codebase keeps naming, and the Coach tab was
 * the last place the rule had not been applied.
 *
 * Its four sections are adherence, volume, plateaus and wins. Every one of
 * those is a PROGRESS question that the coach happens to phrase in a sentence,
 * so the answer and the reading of the answer belong on one screen rather than
 * two. The coach does not lose surface area by losing its tab: it is still on
 * Train as the brief, on the board as the ghost, on the rest canvas, and on
 * Finish as the debrief. It becomes a layer rather than a place.
 *
 * The mode selector did NOT come with it. A mode is a preference, so it went
 * to Settings, which is where the volume dial already lived.
 *
 * ── TWO READS, TWO CADENCES, AND THE SECOND ONE OWES THE FIRST NOTHING ──────
 * `fetchReviewBlock` is one RPC straight to `weekly_review()`: no model, no
 * quota, no cache to bust. `fetchWeeklyReview` is the Edge Function and the
 * sentences. The figures render as soon as SQL answers and STAY through a
 * model retry or an outright model failure.
 *
 * That separation is load-bearing and was learned the hard way. The notes used
 * to be the last branch of the model's state chain, so when the Edge Function
 * timed out on a real account the whole screen collapsed to "The review took
 * too long" with every figure hidden, while the block sat loaded in state a
 * few lines away. WAZN_PLAN §12 says that if AI is dark the deterministic
 * skeleton still renders; before that fix it was a comment rather than a
 * behaviour.
 */
export function WeekReview() {
  const { t } = useLocale()
  const { unit } = useUnit()
  const { speaks } = useCoach()

  const [notes, setNotes] = useState<CoachNotesPayload | null>(null)
  /** The FIGURES, on their own read. See the note above. */
  const [block, setBlock] = useState<ReviewBlock | null>(null)
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

  /** The numbers. Fetched once, independent of the model, and never forced:
   *  SQL has no cache to bust and no quota to spend. */
  useEffect(() => {
    if (supabaseConfigError !== null || !speaks) return
    let active = true
    void fetchReviewBlock().then((facts) => {
      if (active && facts !== null) setBlock(facts)
    })
    return () => {
      active = false
    }
  }, [speaks])

  /**
   * `loading` is set by whatever CAUSES a fetch, never inside the effect:
   * `react-hooks` v7 forbids synchronous setState in an effect body, and it is
   * right to. The effect's job is the request, not the spinner.
   *
   * `unit` is a real dependency. The review quotes e1RM figures, so it is
   * written in whichever unit the reader is on; the function caches per unit.
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
  const recommendation = review?.sections?.recommendation ?? null

  /*
   * Silenced, and it SAYS so, in one muted line.
   *
   * This returned null, on the reasoning that there is a whole screen
   * underneath so absence is coherent. That is true of the layout and false of
   * the reader. On the old tab, silence explained itself: you opened the coach
   * and the coach was silent. As one section among five other cards, a section
   * that is simply gone is indistinguishable from a section that broke, and
   * the lifter who set the dial to Quiet three weeks ago has no way back to
   * that fact from what they can see.
   *
   * A line rather than an `Empty` card, for the same reason the absence below
   * is a line: a 64px ring glyph announcing a preference would be louder than
   * the preference.
   */
  if (!speaks) {
    return (
      <Txt step="caption" ink="muted" style={{ marginBottom: 12 }}>
        {t('coach.quiet')}
      </Txt>
    )
  }

  return (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {/* ── The model's half ────────────────────────────────────────────────
          Headline and the one recommendation. Three states and no fourth,
          because a surface that renders nothing is indistinguishable from one
          still loading. */}
      {state === 'loading' ? (
        <Card>
          {/* A kicker, not a skeleton. A shimmer implies a layout is arriving;
              this is waiting on a sentence, and the layout it lands in is one
              line. */}
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
              /* `setForce(false)` matters and is not tidiness. `force` is
                 sticky: once Regenerate sets it, every later reload carries
                 it, so a lifter who pressed Regenerate once and then hit Try
                 again three times would spend four model calls recovering from
                 one failure. Retry means "load it again" and is entitled to
                 the cache; Regenerate is the only control allowed to spend. */
              setForce(false)
              setReload((n) => n + 1)
            }}
          />
        </Card>
      ) : review === null ? (
        /*
         * A LINE, not an `Empty` card, and that is the difference between a
         * tab and a section. `Empty` draws a 64px ring, a plate bar and
         * centred copy, which is right when it IS the screen and wrong when
         * five cards of real content sit underneath it: on Progress it put a
         * large announcement of an absence above every chart the lifter opened
         * the tab for. The absence is still stated, just at the weight an
         * absence deserves.
         */
        <Txt step="caption" ink="muted">
          {t('coach.empty')}
        </Txt>
      ) : (
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
              <Kick ink={spent ? 'muted' : 'accentSoft'}>{t('coach.regenerate')}</Kick>
            </Pressable>
          </View>

          {review.headline !== '' && <Txt step="title">{review.headline}</Txt>}

          {recommendation?.line !== undefined && (
            <>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Plate size={30} variant="hub" color={palette.ink} />
                <Txt step="body" style={{ flex: 1 }}>
                  {recommendation.line}
                </Txt>
              </View>
              {/* "No chip, no claim." The chip is where the sentence gets
                  pinned to a number the reader can check in the figures
                  below, and it renders only when the function sent one. */}
              {recommendation.chip !== undefined && <Chip>{recommendation.chip}</Chip>}
            </>
          )}
        </Card>
      )}

      {/* ── The figures ─────────────────────────────────────────────────────
          Deliberately OUTSIDE the state chain above. Every number here is
          computed in Postgres and owes the model nothing. */}
      {(block !== null || review !== null) && (
        <CoachNotes
          block={block}
          unit={unit}
          lines={{
            adherence: review?.sections?.adherence?.line ?? null,
            bands: review?.sections?.bands?.line ?? null,
            plateaus: review?.sections?.plateaus?.line ?? null,
            wins: review?.sections?.wins?.line ?? null,
          }}
        />
      )}

      {/* One disclaimer per screen, not one per surface. The quota joins it
          only once it is worth saying: the limits are ~500 loop backstops, so
          "500 regenerates left" is furniture that invites a reader to manage a
          budget nobody has. */}
      <Txt step="nano" ink="muted" style={{ textAlign: 'center' }}>
        {[
          t('coach.footer'),
          left === null || left > QUOTA_VISIBLE_AT
            ? null
            : t('coach.footer.quota', { n: String(left) }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Txt>
    </View>
  )
}
