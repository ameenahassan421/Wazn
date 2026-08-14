import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/report-error'

/**
 * The thing that stops one leaf crash blanking the whole app.
 *
 * Named L7 in the parity plan's gap list, and found the hard way: a component
 * that throws during render unmounts its entire tree, so a single bad value in
 * one chart took out the tab it lived on and left a black screen with no way
 * back. React has no hook form of this — a class component is the only API
 * that can catch a render error, which is why this file is the one class in
 * `src/`.
 *
 * Two boundaries, on purpose (see `App.tsx`):
 *
 *  - one **per tab**, so a crash costs you that screen and nothing else. The
 *    tab bar keeps working, and switching tabs is itself the recovery.
 *  - one at the **root**, because the header and tab bar can throw too, and a
 *    boundary that only wraps the content cannot catch its own chrome.
 *
 * The copy is written for someone mid-workout. Under load the only questions
 * that matter are "did I lose my sets" and "what do I press", so the answer to
 * the first is stated before anything else and the second is one control at
 * hot-path size. Every set is written to `workout_sets` on commit, before any
 * local state changes, so "already saved" is a fact rather than a comfort.
 */

interface Props {
  children: ReactNode
  /** Which boundary this is — 'root', or the tab name. Goes to the ledger. */
  boundary: string
  /**
   * Bumping this remounts the subtree and clears the error. `App.tsx` passes
   * the active tab, which is what makes "switch tabs and come back" work
   * without a reload.
   */
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately not awaited. The fallback is already on screen; reporting
    // is instrumentation and must never delay it or be able to fail it.
    void reportError({
      error,
      boundary: this.props.boundary,
      componentStack: info.componentStack ?? undefined,
    })
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    /* rounded-xl, not 2xl: the project's :root overrides Tailwind's
       sm/md/lg/xl radii but not 2xl, so `rounded-2xl` resolved to Tailwind's
       own 16px and rendered SMALLER than `rounded-xl`'s 20px. This card was
       the app's only 2xl, and so the only card not shaped like a card.
       See DESIGN.md, the Shadowed Scale Rule. */
    return (
      <section
        role="alert"
        className="ring-edge mx-auto my-10 w-full max-w-[430px] rounded-xl bg-surface p-5"
      >
        {/* Amber and outlined, never red — §2.4. A crash is the app's fault,
            and shouting at the user in red does not make it less so. */}
        <p className="font-mono text-[12px] tracking-[0.08em] text-accent-300 uppercase">
          Something broke
        </p>
        <p className="mt-3 text-[15px] text-text">
          Every set you logged is already saved. This screen stopped working — nothing
          else did.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Try it again, or use the arrow at the top of the screen to go back.
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="press btn-base btn-primary mt-5 h-[58px] w-full text-[15px]"
        >
          Try again
        </button>
      </section>
    )
  }
}
