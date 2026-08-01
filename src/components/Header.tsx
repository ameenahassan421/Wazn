import { useUnit } from '../lib/unit-context'
import { supabase } from '../lib/supabase'

export function Header() {
  const { unit, toggleUnit } = useUnit()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center gap-2 px-4">
        <h1 className="text-base font-semibold tracking-tight">Wazn</h1>

        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleUnit}
            aria-label={`Weight unit: ${unit}. Tap to switch.`}
            className="tnum h-11 min-w-14 rounded-md border border-line px-3 text-sm font-semibold text-text"
          >
            {unit}
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="h-11 rounded-md px-3 text-sm text-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
