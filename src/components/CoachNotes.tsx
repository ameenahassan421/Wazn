import { useEffect, useState } from 'react'
import { AI_DISCLAIMER, fetchCoachNotes, type CoachNotes } from '../lib/ai'
import { formatRelativeDay } from '../lib/format'

/**
 * Coach's Notes, at the top of Progress.
 *
 * Two rules from plan §2C shape how this behaves rather than how it looks:
 *
 *  - It is never on the critical path. It loads after the charts, fails
 *    quietly into a single line, and nothing else on the screen waits for it.
 *    The Log tab does not know it exists.
 *  - Generation is lazy. This asks on open; the function returns the cache
 *    unless a newer workout has landed since the notes were written.
 */
export function CoachNotes() {
  const [notes, setNotes] = useState<CoachNotes | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await fetchCoachNotes()
        if (!active) return
        setNotes(result)
        setState('ready')
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Notes are unavailable.')
        setState('failed')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (state === 'loading') {
    return (
      <section
        className="ring-edge bg-surface px-3 py-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <h2 className="kicker mb-2">Coach's notes</h2>
        <p className="text-sm text-muted">Reading your last few weeks…</p>
      </section>
    )
  }

  // A failure is one quiet line, not an alert. Nothing here is load-bearing:
  // every number on this screen is computed in SQL and rendered without it.
  if (state === 'failed' || !notes) {
    return (
      <section
        className="ring-edge bg-surface px-3 py-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <h2 className="kicker mb-2">Coach's notes</h2>
        <p className="text-sm text-muted">{message ?? 'Notes are unavailable.'}</p>
      </section>
    )
  }

  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Coach's notes</h2>
        <span className="text-[11px] text-muted">
          {formatRelativeDay(notes.generatedAt)}
        </span>
      </div>

      <ol className="flex flex-col">
        {notes.insights.map((insight, i) => (
          <li key={insight.title}>
            {i > 0 && <div className="rule-fade my-2.5" />}
            <p className="text-[15px] font-medium">{insight.title}</p>
            <p className="mt-0.5 text-sm text-muted">{insight.body}</p>
          </li>
        ))}
      </ol>

      {/* Required on every AI surface. Small, but never behind a disclosure —
          a label you have to open is a label that was not shown. */}
      <p className="mt-3 text-[11px] text-muted">{AI_DISCLAIMER}</p>
    </section>
  )
}
