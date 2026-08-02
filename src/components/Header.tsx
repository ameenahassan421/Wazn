import { useUnit } from '../lib/unit-context'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'

/**
 * The Log tab shows the mark; History and Progress show their name, because
 * on those screens the title is the only thing saying where you are.
 *
 * The controls draw a compact 34px chip inside a 48px button. The design
 * called for 34px controls outright, but §2.4 sets a 48px touch floor and
 * this is a one-handed app — the visual density is kept, the target is not.
 */
export function Header({ title }: { title?: string }) {
  const { unit, toggleUnit } = useUnit()

  return (
    <header className="header-band sticky top-0 z-20">
      <div
        className="mx-auto flex w-full max-w-[430px] items-center gap-1 px-[18px] pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}
      >
        <h1 className="flex items-center text-[17px] font-medium tracking-tight">
          {title ?? <Wordmark height={34} className="text-text" />}
        </h1>

        <div className="ms-auto flex items-center">
          <button
            type="button"
            onClick={toggleUnit}
            aria-label={`Weight unit: ${unit}. Tap to switch.`}
            className="flex h-12 items-center px-1"
          >
            <span className="btn-base btn-secondary tnum h-[34px] min-w-[52px] px-3 text-sm">
              {unit}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="btn-base btn-quiet h-12 px-2 text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
