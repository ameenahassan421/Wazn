import { RANGES } from '@wazn/core/range'
import type { RangeKey } from '@wazn/core/range'

/**
 * The time window for one chart block. One row, four chips, same grammar as
 * the muscle-group chips on New exercise — outlined by default, amber on a
 * 10% tint when chosen. Not a solid amber fill: §2.4 allows exactly one of
 * those per screen and Progress carries two of these rows.
 *
 * Each block owns its own range rather than sharing one across the screen.
 * "How much am I lifting lately" and "where is my bench all time" are two
 * different questions, and a single control would force one answer on both.
 */
export function RangeChips({
  value,
  onChange,
  label,
}: {
  value: RangeKey
  onChange: (key: RangeKey) => void
  /** Names the group for screen readers — "Volume range", not "range". */
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {RANGES.map((range) => {
        const on = range.key === value
        return (
          <button
            key={range.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(range.key)}
            className={`press btn-base h-12 flex-1 font-mono text-label tracking-[0.08em] ${
              on ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {range.label}
          </button>
        )
      })}
    </div>
  )
}
