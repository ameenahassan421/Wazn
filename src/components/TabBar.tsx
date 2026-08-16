import { useLocale } from '../lib/locale-context'

/**
 * The six-tab bar — design v3.0 §Information architecture.
 *
 * ── WHY THIS EXISTS AGAIN ───────────────────────────────────────────────────
 * The five-tab bar was retired on 2026-08-13 (the audit's S2, "five equal tabs
 * for five unequal jobs") and replaced with doors: cards that are themselves
 * the way into the screen they summarise. The v3 handoff reverses that and
 * grows the bar to six, and Ameen confirmed the handoff wins. **The doors are
 * kept.** Nothing that used to open a screen has stopped opening it — the Last
 * PR card still goes to Progress, the coach card still goes to Coach, the
 * avatar still goes to Settings — so the two harnesses that navigate by
 * pressing real controls did not have to be rewritten around this, and a
 * lifter who learned the app last week has not lost their route.
 *
 * ── SIX TARGETS AT 390px ────────────────────────────────────────────────────
 * 65px each, above the 48px floor (§2.4). Height is 58px and the labels are
 * mono 9px — the meta voice, because a tab label is a stamped name for a
 * place, not a spoken word.
 *
 * The glyphs are drawn here rather than in `icons.tsx` because they are not
 * icons in that set's sense: they are 24-grid marks built from the same parts
 * as the wordmark (a plate ring, a bar, a disc), and each is a `<span>` stack
 * rather than an SVG so it inherits the accent with no fill/stroke plumbing.
 */

export const TABS = ['log', 'history', 'progress', 'body', 'coach', 'friends'] as const

export type TabKey = (typeof TABS)[number]

const LABEL_KEY: Record<TabKey, string> = {
  log: 'nav.log',
  history: 'nav.history',
  progress: 'nav.progress',
  body: 'nav.body',
  coach: 'nav.coach',
  friends: 'nav.friends',
}

/** The bar's own height. Exported because three sticky clusters clear it. */
export const TAB_BAR_HEIGHT = 58

function Glyph({ tab, on }: { tab: TabKey; on: boolean }) {
  // v5 colours the whole active tab `soft` (accent-300) and everything else
  // `faint` — a wider gap than v3's accent/muted, so the current place reads
  // from the corner of the eye rather than being found by reading. The ember
  // 500 is spent on the rail alone, which is the one piece of chrome here.
  const ink = on ? 'var(--color-accent-300)' : 'var(--color-faint)'

  switch (tab) {
    // A loaded plate, seen face on — the mark's own part.
    case 'log':
      return (
        <span
          className="block h-[14px] w-[14px] rounded-full"
          style={{ border: `3px solid ${ink}` }}
        />
      )
    // The same plate with a hub: a record of one that has been racked.
    case 'history':
      return (
        <span
          className="grid h-[14px] w-[14px] place-items-center rounded-full"
          style={{ border: `2px solid ${ink}` }}
        >
          <span
            className="block h-[4px] w-[4px] rounded-full"
            style={{ background: ink }}
          />
        </span>
      )
    // Three plates stepping up — the same ascending shape the streak uses.
    case 'progress':
      return (
        <span className="flex h-[14px] items-end gap-[2px]">
          <span className="block h-[6px] w-[3px]" style={{ background: ink }} />
          <span className="block h-[10px] w-[3px]" style={{ background: ink }} />
          <span className="block h-[14px] w-[3px]" style={{ background: ink }} />
        </span>
      )
    // A silhouette at scale: head over shoulders. Non-directional, so it does
    // not need to flip with the layout.
    case 'body':
      return (
        <span className="flex flex-col items-center gap-[1px]">
          <span
            className="block h-[6px] w-[6px] rounded-full"
            style={{ border: `2px solid ${ink}` }}
          />
          <span
            className="block h-[5px] w-[12px]"
            style={{ border: `2px solid ${ink}`, borderRadius: 3 }}
          />
        </span>
      )
    // A plate on edge: the coach reads the bar side on.
    case 'coach':
      return (
        <span
          className="block h-[11px] w-[11px] rotate-45"
          style={{ border: `2px solid ${ink}` }}
        />
      )
    // Two discs, overlapping. `margin-inline-start` so the overlap flips with
    // the layout rather than pointing the wrong way in Arabic.
    case 'friends':
      return (
        <span className="flex">
          <span
            className="block h-[12px] w-[12px] rounded-full"
            style={{ border: `2px solid ${ink}` }}
          />
          <span
            className="-ms-[4px] block h-[12px] w-[12px] rounded-full"
            // The bar's own ground, not `surface`: the overlap is a cut-out
            // in the disc behind it, so it has to match whatever it sits on.
            // It sat on `surface` until the bar got its own darker ground,
            // at which point the notch would have glowed.
            style={{ border: `2px solid ${ink}`, background: 'var(--color-tabbar)' }}
          />
        </span>
      )
  }
}

export function TabBar({
  active,
  onSelect,
}: {
  active: TabKey | null
  onSelect: (tab: TabKey) => void
}) {
  const { t } = useLocale()

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-20"
      style={{
        background: 'var(--color-tabbar)',
        borderTop: '1px solid var(--color-line)',
        // The bar is 58px of chrome plus whatever the phone reserves below it.
        // Without this the home indicator sits on top of the labels.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <ul className="mx-auto grid max-w-[430px] grid-cols-6">
        {TABS.map((tab) => {
          const on = tab === active
          return (
            <li key={tab}>
              <button
                type="button"
                onClick={() => onSelect(tab)}
                aria-current={on ? 'page' : undefined}
                className="press relative flex w-full flex-col items-center justify-center gap-[3px]"
                style={{ height: TAB_BAR_HEIGHT }}
              >
                {/* The live rail, sitting ON the bar's top border rather than
                    inside the column. v5 runs it 20%–80% of the tab's width,
                    which at six tabs on a 430px screen is 43px — wide enough
                    to read as a lit segment of the edge rather than as a dash
                    under nothing. Absolute, so it costs the row no height and
                    the glyphs cannot shift by two pixels on navigation. */}
                <span
                  aria-hidden="true"
                  className="absolute start-[20%] end-[20%] top-0 block h-[2px]"
                  style={{ background: on ? 'var(--color-accent)' : 'transparent' }}
                />
                <span
                  aria-hidden="true"
                  className="mt-[3px] grid h-[14px] place-items-center"
                >
                  <Glyph tab={tab} on={on} />
                </span>
                <span
                  className="meta-mono text-nano"
                  style={{
                    color: on ? 'var(--color-accent-300)' : 'var(--color-faint)',
                  }}
                >
                  {t(LABEL_KEY[tab])}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
