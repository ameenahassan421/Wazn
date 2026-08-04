import { useState } from 'react'
import {
  AI_DISCLAIMER,
  ROUTINE_EQUIPMENT,
  ROUTINE_GOALS,
  generateRoutines,
} from '../lib/ai'
import { IconBack } from './icons'

/**
 * Goal, days per week, equipment. Three questions, because a fourth would make
 * this a form and the point is that building a routine by hand already works —
 * this is for the person who does not yet know what to put in one.
 *
 * What comes back is ordinary routines. They appear in the list next to
 * hand-built ones, with no badge and no special handling, because after the
 * first edit there would be no honest way to tell them apart.
 */
export function RoutineGenerator({
  onDone,
  onBack,
}: {
  onDone: (count: number) => void
  onBack: () => void
}) {
  const [goal, setGoal] = useState<string>('muscle')
  const [days, setDays] = useState(3)
  const [equipment, setEquipment] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleEquipment(id: string) {
    setEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const result = await generateRoutines({ goal, days, equipment })
      onDone(result.routines.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a routine.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="btn-base btn-quiet h-12 w-12"
        >
          <IconBack size={20} className="icon-start" />
        </button>
        <h2 className="flex-1 text-base font-medium">Generate a routine</h2>
      </div>

      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <fieldset>
        <legend className="kicker mb-2">Goal</legend>
        <div className="flex flex-wrap gap-2">
          {ROUTINE_GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={goal === g.id}
              onClick={() => setGoal(g.id)}
              className={`btn-base h-12 px-4 text-sm ${
                goal === g.id ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="kicker mb-2">Days per week</legend>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === n}
              onClick={() => setDays(n)}
              className={`btn-base tnum h-12 w-12 text-figure ${
                days === n ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="kicker mb-2">Equipment · all if none picked</legend>
        <div className="flex flex-wrap gap-2">
          {ROUTINE_EQUIPMENT.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={equipment.includes(e.id)}
              onClick={() => toggleEquipment(e.id)}
              className={`btn-base h-12 px-4 text-sm ${
                equipment.includes(e.id) ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* The one hero button on this screen — it is the only thing the screen
          exists to do. */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="btn-base btn-hero h-[60px] w-full text-[17px] disabled:opacity-45"
      >
        {busy ? 'Building…' : `Generate ${days} routines`}
      </button>

      <p className="text-[11px] text-muted">
        {AI_DISCLAIMER} You can edit or delete anything it makes, and nothing starts
        until you start it.
      </p>
    </div>
  )
}
