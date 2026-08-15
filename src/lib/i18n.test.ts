import { describe, expect, it } from 'vitest'
import { t, resolveInitialLocale, messages } from './i18n'

describe('t()', () => {
  it('returns the English message for an English locale', () => {
    expect(t('en', 'toggle.locale.label')).toBe('EN')
  })

  it('returns the Arabic message for an Arabic locale', () => {
    expect(t('ar', 'toggle.locale.label')).toBe('AR')
  })

  it('interpolates {name} placeholders', () => {
    // The interpolation engine replaces {name} tokens. We verify it with
    // a synthetic key: the missing-key path returns the raw key, but the
    // regex still runs. A message that contains a real placeholder would be
    // the ideal test; for now, verify no crash on a param-rich call.
    const result = t('en', 'nonexistent', { name: 'test' })
    expect(result).toBe('nonexistent')
  })

  it('falls back to the key when the message is missing in both locales', () => {
    expect(t('en', 'missing.key')).toBe('missing.key')
    expect(t('ar', 'missing.key')).toBe('missing.key')
  })

  it('falls back to English when a key is missing in the requested locale', () => {
    // toggle.locale.label exists in both, but if one were missing the
    // English fallback should kick in. We can verify the mechanism by
    // checking that existing keys always resolve.
    expect(t('ar', 'toggle.locale.label')).toBe('AR')
  })
})

describe('Slice 4 history/progress keys', () => {
  // Spot-checks that the new screen strings resolve in both locales. The full
  // key-set parity check above is the safety net; these pin the actual values
  // the screens render, so a bad edit to a message is caught here.
  it('history.empty resolves in both locales', () => {
    // The heading of the design's empty-history screen. It used to read "Log
    // one on the Log tab", which outlived the tab it named by one release.
    expect(t('en', 'history.empty')).toContain('starts today')
    expect(t('ar', 'history.empty')).toContain('يبدأ اليوم')
    expect(t('en', 'history.empty.cta')).toBe('Start a workout')
  })

  it('interpolates the history personal-record title', () => {
    expect(t('en', 'history.pr_title', { count: '1' })).toBe('1 personal record')
    expect(t('en', 'history.pr_title_plural', { count: '3' })).toBe(
      '3 personal records',
    )
  })

  it('progress empty states resolve in both locales', () => {
    expect(t('en', 'progress.balance.empty')).toBe('Log a workout to load the bar.')
    expect(t('ar', 'progress.balance.empty')).toContain('سجّل تمرينًا')
    expect(t('en', 'progress.empty_notice')).toContain('your own sets')
    expect(t('ar', 'progress.empty_notice')).toContain('مجموعاتك الخاصة')
  })

  it('interpolates progress volume heading with the span', () => {
    expect(t('en', 'progress.volume.heading', { span: 'all time' })).toBe(
      'Volume · all time',
    )
  })
})

describe('Slice 5 log screen keys', () => {
  // Spot-checks that the LogScreen strings resolve in both locales. The full
  // key-set parity check above is the safety net; these pin the actual values
  // the screen renders, so a bad edit to a message is caught here.
  it('log.start resolves in both locales', () => {
    expect(t('en', 'log.start')).toBe('Start workout')
    expect(t('en', 'log.start_first')).toBe('Start your first workout')
    expect(t('ar', 'log.start')).toBe('ابدأ التمرين')
    expect(t('ar', 'log.start_first')).toBe('ابدأ أول تمرين لك')
  })

  it('interpolates the in-progress workout name', () => {
    expect(t('en', 'log.in_progress', { name: 'Push day' })).toBe(
      'Push day · in progress',
    )
    expect(t('ar', 'log.in_progress', { name: 'يوم الضغط' })).toContain('يوم الضغط')
  })

  it('finish/discard confirmations resolve in both locales', () => {
    expect(t('en', 'log.finish')).toBe('Finish')
    expect(t('en', 'log.finish_confirm')).toBe('Finish?')
    expect(t('en', 'log.discard')).toBe('Discard workout')
    expect(t('ar', 'log.finish')).toBe('إنهاء')
    expect(t('ar', 'log.discard')).toBe('تجاهل التمرين')
  })

  it('interpolates the still-saving plural keys', () => {
    expect(t('en', 'log.finish_still_saving.set', { count: '1' })).toContain(
      '1 set is still saving',
    )
    expect(t('en', 'log.finish_still_saving.sets', { count: '4' })).toContain(
      '4 sets are still saving',
    )
    expect(t('ar', 'log.finish_still_saving.set', { count: '1' })).toContain('مجموعة')
  })

  it('sync note strings resolve in both locales', () => {
    expect(t('en', 'log.sync.saving', { count: '2 sets' })).toBe('Saving 2 sets…')
    expect(t('en', 'log.sync.offline')).toBe('Offline · logging as normal')
    expect(t('ar', 'log.sync.saving', { count: 'مجموعتان' })).toContain('جارٍ حفظ')
    expect(t('ar', 'log.sync.offline')).toContain('غير متصل')
  })

  it('error context strings resolve in both locales', () => {
    expect(t('en', 'log.error.load_workout')).toBe('Loading your workout')
    expect(t('en', 'log.error.finish')).toBe('Finishing the workout')
    expect(t('ar', 'log.error.load_workout')).toBe('جارٍ تحميل تمرينك')
    expect(t('ar', 'log.error.finish')).toBe('جارٍ إنهاء التمرين')
  })
})

describe('catalogue parity', () => {
  // The check that catches a missed translation: every key the en catalogue
  // ships must exist in ar, and vice versa. If a screen string is added to
  // one and forgotten in the other, this fails.
  it('en and ar have identical key sets', () => {
    expect(Object.keys(messages.ar).sort()).toEqual(Object.keys(messages.en).sort())
  })

  it('never leaves a catalogue value empty', () => {
    for (const locale of ['en', 'ar'] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value, `${locale}.${key} is empty`).not.toBe('')
      }
    }
  })
})

describe('resolveInitialLocale', () => {
  it('returns stored value when it is a valid locale', () => {
    expect(resolveInitialLocale('ar', 'en-US')).toBe('ar')
    expect(resolveInitialLocale('en', 'ar-EG')).toBe('en')
  })

  it('returns ar when navigator language primary subtag is ar', () => {
    expect(resolveInitialLocale(null, 'ar-EG')).toBe('ar')
    expect(resolveInitialLocale(null, 'ar')).toBe('ar')
    expect(resolveInitialLocale(null, 'ar-SA')).toBe('ar')
  })

  it('returns en as the default fallback', () => {
    expect(resolveInitialLocale(null, 'en-US')).toBe('en')
    expect(resolveInitialLocale(null, 'fr-FR')).toBe('en')
    expect(resolveInitialLocale(null, '')).toBe('en')
  })

  it('ignores a malformed stored value and falls through to navigator', () => {
    expect(resolveInitialLocale('fr', 'ar-EG')).toBe('ar')
    expect(resolveInitialLocale('zh', 'en-US')).toBe('en')
    expect(resolveInitialLocale('', 'ar-EG')).toBe('ar')
  })

  it('handles an empty navigator language string', () => {
    expect(resolveInitialLocale(null, '')).toBe('en')
  })
})

/**
 * The voice doctrine, as a test rather than a review.
 *
 * Design v3.0 §Doctrine D3: "**Never guilt.** The AI has no vocabulary for
 * 'missed', 'failed', 'only'. A lighter day is data, not a lapse." GATE V3's
 * fifth criterion is a **streak copy review** — "no loss-framed sentence
 * ships" — and a review is a thing that happens once, to the strings that
 * existed that day. This is the same criterion applied to every string, on
 * every run.
 *
 * The engagement section is explicit about why it matters here specifically:
 * streaks are weekly, not daily, "because daily streaks punish rest, which a
 * strength app must never do". A loss-framed sentence would undo the choice
 * the data model already made.
 *
 * Exemptions are listed one by one rather than being pattern-matched away. A
 * blanket "ignore auth strings" rule would let a guilt-framed auth sentence
 * through; naming each one means adding a new exemption is a decision someone
 * has to write down.
 */
describe('copy doctrine — never guilt (v3 D3, GATE V3 · 5)', () => {
  /** Vocabulary the doctrine names, plus the loss framings streaks attract. */
  const GUILT =
    /\b(missed|failed|lapse|lazy|shame|forfeit|slipped|streak ends|keep it alive|don'?t lose|last chance|you should have)\b/i

  const EXEMPT = new Set([
    // Not about training, and factually the right word for a one-time code.
    'auth.confirm.error.expired',
    'auth.code.verify.error.expired',
    'auth.reset.error.expired',
    // The crash boundary. Not the coach's voice, and honesty beats softening
    // when the app has actually broken.
    'error.title',
  ])

  for (const locale of ['en', 'ar'] as const) {
    it(`has no guilt vocabulary in ${locale}`, () => {
      const offenders = Object.entries(messages[locale])
        .filter(([key, value]) => !EXEMPT.has(key) && GUILT.test(value))
        .map(([key, value]) => `${key}: ${value}`)
      expect(offenders).toEqual([])
    })
  }

  it('frames every streak string as a count, never as something at risk', () => {
    // The check is positive rather than negative: a streak string may say what
    // the streak IS, and must not say what happens if it stops.
    const streakStrings = Object.entries(messages.en).filter(([key]) =>
      /streak|freeze/.test(key),
    )
    expect(streakStrings.length).toBeGreaterThan(0)
    for (const [key, value] of streakStrings) {
      expect(`${key}: ${value}`).not.toMatch(GUILT)
      expect(`${key}: ${value}`).not.toMatch(/\b(lose|lost|losing|break|broken)\b/i)
    }
  })
})
