import { IconBarbell, IconHistory, IconPeople, IconStar, IconTrend } from './icons'
import type { ComponentType } from 'react'
import { useLocale } from '../lib/locale-context'

export type Tab = 'log' | 'history' | 'progress' | 'coach' | 'friends'

const TABS: {
  id: Tab
  key: string
  Icon: ComponentType<{ size?: number }>
}[] = [
  { id: 'log', key: 'nav.log', Icon: IconBarbell },
  { id: 'history', key: 'nav.history', Icon: IconHistory },
  { id: 'progress', key: 'nav.progress', Icon: IconTrend },
  { id: 'coach', key: 'nav.coach', Icon: IconStar },
  { id: 'friends', key: 'nav.friends', Icon: IconPeople },
]

/**
 * Icon + label, as every phone app's bottom bar does it: the icons are what
 * makes five plain words read as navigation rather than as buttons.
 *
 * The active tab is marked by a rail along the *top* edge rather than a fill
 * or an underline: at the bottom of the screen an underline collides with the
 * home indicator, and a filled tab reads as a button you have not pressed yet.
 */
export function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  const { t } = useLocale()

  return (
    <nav
      className="fixed bottom-0 z-20 w-full bg-ink"
      style={{ borderTop: '1px solid rgba(236,235,232,0.09)' }}
    >
      <div
        className="mx-auto flex w-full max-w-[430px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        {TABS.map(({ id, key, Icon }) => {
          const selected = id === active
          return (
            <button
              key={id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => onChange(id)}
              className={`flex h-[60px] flex-1 flex-col items-center justify-center gap-1 ${
                selected ? 'text-soft' : 'text-muted'
              }`}
              style={
                selected
                  ? { boxShadow: 'inset 0 2px 0 var(--color-accent)' }
                  : undefined
              }
            >
              <Icon size={21} />
              <span
                className={`text-[10px] leading-none whitespace-nowrap ${selected ? 'font-medium' : ''}`}
              >
                {t(key)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
