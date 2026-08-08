import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * One screen's blast radius.
 *
 * Before this there was no error boundary anywhere in `src/`, so any leaf that
 * threw took the whole tab with it — React unmounts the entire tree from the
 * root, and what a user sees is a black rectangle with no message and no way
 * back. The 2026-08-07 visual pass hit exactly that: one missing column made
 * `ExerciseThumb` throw and the Progress tab went dark.
 *
 * A boundary per screen turns that into a recoverable screen. It is mounted
 * *inside* `<main>`, so the header and the tab bar stay outside it and stay
 * usable — the user can always leave. Switching tabs unmounts the boundary
 * along with the screen, so the failed state cannot outlive the visit.
 *
 * Errors are amber and outlined here, never red: design v2 spends exactly one
 * colour, and an error is not the exception to that.
 */
export class ScreenBoundary extends Component<
  {
    children: ReactNode
    /** Names the screen in the fallback and, more importantly, picks the copy. */
    screen: string
    /**
     * The Log screen's promise. A crash mid-workout must never read as lost
     * training, so its fallback says so outright.
     */
    reassurance?: string
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing ships these anywhere yet. The console is what a tester on a
    // desktop can read back, and it is where the next defect gets found.
    console.error(`[${this.props.screen}] screen crashed`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <section
        role="alert"
        className="border border-accent bg-surface px-4 py-4"
        style={{ borderRadius: 'var(--radius-md)', marginBlockStart: '2rem' }}
      >
        <p className="kicker text-accent">{this.props.screen}</p>
        <h2 className="mt-1.5 text-[19px] font-medium">This screen failed to draw.</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {this.props.reassurance ??
            'Nothing was lost — this is a display problem, not a data one. Try again, or use another tab.'}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="btn-base btn-secondary press mt-3.5 h-12 w-full text-sm"
        >
          Try again
        </button>
      </section>
    )
  }
}
