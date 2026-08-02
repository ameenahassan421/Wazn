export type Tab = 'log' | 'history' | 'progress'

const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
  { id: 'progress', label: 'Progress' },
]

/**
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
  return (
    <nav
      className="fixed bottom-0 z-20 w-full bg-ink"
      style={{ borderTop: '1px solid rgba(236,235,232,0.09)' }}
    >
      <div
        className="mx-auto flex w-full max-w-[430px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        {TABS.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => onChange(tab.id)}
              className={`h-[54px] flex-1 text-sm ${
                selected ? 'font-medium text-accent' : 'text-muted'
              }`}
              style={
                selected
                  ? { boxShadow: 'inset 0 2px 0 var(--color-accent)' }
                  : undefined
              }
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
