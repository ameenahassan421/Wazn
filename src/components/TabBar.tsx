export type Tab = 'log' | 'history' | 'progress'

const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
  { id: 'progress', label: 'Progress' },
]

export function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="fixed bottom-0 z-20 w-full border-t border-line bg-ink">
      <div
        className="mx-auto flex w-full max-w-[430px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => onChange(tab.id)}
              className={`h-14 flex-1 text-sm font-semibold ${
                selected ? 'text-accent' : 'text-muted'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
