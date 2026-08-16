import { useEffect, useMemo, useRef, useState } from 'react'
import type { OverviewRow, WorkoutBlock } from '../lib/plan'
import { dropIndex, moveItem, supersetRound } from '../lib/plan'
import type { Exercise } from '../lib/types'
import { SET_TYPE_LABEL, SET_TYPE_NAME, isRecord } from '../lib/types'
import type { Unit } from '../lib/units'
import { formatWeight } from '../lib/units'
import { describeRest, REST_MAX_SECONDS, stepRest } from '../lib/rest'
import { REST_STEP_SECONDS } from '../lib/use-rest-timer'
import { ExerciseThumb } from './ExerciseThumb'
import { IconMore } from './icons'
import { useLocale } from '../lib/locale-context'
import type { GhostVerdict } from '../lib/ghost-reason'

/**
 * The workout overview — design v2.2, the spine of a session.
 *
 * This screen is the ledger, not the keyboard. It answers "where am I in this
 * session?"; the focused view (`SetEntry`) answers "what exactly am I about to
 * lift?" and survives unchanged as the zoom state. The split is the whole
 * design, and the two rules that follow from it are absolute:
 *
 *  1. **No input lives here.** No keyboard, no steppers, no per-cell editing.
 *     A 24px number in a 56px row is for reading. Typing happens where the
 *     instrumentation is.
 *  2. **A ghost row is client state.** It has never been in the database. The
 *     check is what turns it into an INSERT, and nothing else does.
 *
 * One row, two targets, two intents: the **check** commits it exactly as shown
 * (1 tap — GATE U2 measures this and it must not get more expensive than the
 * old "Log set" button), and the **values** open the focused view at that row
 * for the "not what I planned" case.
 */

export interface OverviewBlock extends WorkoutBlock {
  exercise: Exercise | undefined
  note: string | null
  restSeconds: number
  /**
   * v3: what the coach did to this block's ghosts, and why. Absent when the
   * coach volume is `off` — which is what makes the board render v2.2
   * verbatim rather than v3 with the chips hidden.
   */
  verdict?: GhostVerdict | null
  /** v3: `coach adjusted today`, on the meta line. */
  adjusted?: boolean
}

const ROW_HEIGHT = 56
/** The design's set row. 54px, and the grid it is drawn on. */
const V3_ROW_HEIGHT = 54
const ROW_GRID = '26px 1fr auto 44px'
/** Long-press before a drag starts, so a scroll that begins on the grip works. */
const LONG_PRESS_MS = 250
/** Movement that cancels the pending long-press: this was a scroll, not a drag. */
const SCROLL_SLOP_PX = 8

/** `102.5 × 8`, with the blanks the app is allowed to admit to. */
function values(weightKg: number | null, reps: number | null, unit: Unit): string {
  const weight = weightKg === null ? '—' : formatWeight(weightKg, unit)
  return `${weight} × ${reps ?? '—'}`
}

interface DragState {
  from: number
  pointerId: number
  startY: number
  y: number
  /** Block centres and heights snapshotted at lift-off, in viewport space. */
  centres: number[]
  heights: number[]
  to: number
}

export function WorkoutOverview({
  blocks,
  unit,
  busy,
  editingKey,
  focusKey,
  onCommit,
  onOpenRow,
  onAddGhost,
  onReorder,
  onSaveNote,
  onSaveRest,
  onUngroup,
  onRemove,
  onExplain,
  onTellCoach,
}: {
  /** In display order. Superset members are already adjacent. */
  blocks: OverviewBlock[]
  unit: Unit
  busy: boolean
  /** The row the focused view is currently open on, if any. */
  editingKey?: string | null
  /** Row to bring into the thumb band — set after a commit. */
  focusKey?: string | null
  onCommit: (exerciseId: string, row: OverviewRow) => void
  onOpenRow: (exerciseId: string, row: OverviewRow) => void
  onAddGhost: (exerciseId: string) => void
  onReorder: (order: string[]) => void
  onSaveNote: (exerciseId: string, note: string) => void
  onSaveRest: (exerciseId: string, seconds: number) => void
  onUngroup: (exerciseId: string) => void
  onRemove: (exerciseId: string) => void
  /** v3 §02: tapping a reasoning chip opens the explainer. */
  onExplain?: (exerciseId: string) => void
  /** v3 §07: the `⋮` overflow's mid-workout entry to "Tell the coach". */
  onTellCoach?: (exerciseId: string) => void
}) {
  const { t } = useLocale()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStart = useRef<{ y: number; index: number; pointerId: number } | null>(
    null,
  )

  const order = useMemo(() => blocks.map((b) => b.exerciseId), [blocks])

  /**
   * Bring the next actionable ghost into the thumb band after a commit — not
   * to the top of the screen. The next thing you touch should arrive under the
   * thumb that just committed.
   *
   * Only when it is outside the band already: scrolling a row that is under
   * the thumb is motion answering a question nobody asked.
   */
  useEffect(() => {
    if (!focusKey) return
    const el = rowRefs.current.get(focusKey)
    if (!el || typeof el.getBoundingClientRect !== 'function') return
    if (typeof el.scrollIntoView !== 'function') return
    const rect = el.getBoundingClientRect()
    const height = window.innerHeight || 844
    if (rect.top > height * 0.42 && rect.bottom < height * 0.86) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusKey])

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current)
    },
    [],
  )

  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
    pressStart.current = null
  }

  function onGripDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    const target = event.currentTarget
    const pointerId = event.pointerId
    const y = event.clientY
    pressStart.current = { y, index, pointerId }
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      const rects = order.map((id) => {
        const node = itemRefs.current.get(id)
        return node?.getBoundingClientRect?.() ?? { top: 0, height: ROW_HEIGHT }
      })
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // Capture is a nicety; without it the move handler still fires while
        // the pointer stays over the grip. Never worth failing the gesture.
      }
      setDrag({
        from: index,
        to: index,
        pointerId,
        startY: y,
        y,
        centres: rects.map((r) => r.top + r.height / 2),
        heights: rects.map((r) => r.height),
      })
    }, LONG_PRESS_MS)
  }

  function onGripMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag) {
      if (event.pointerId !== drag.pointerId) return
      const y = event.clientY
      setDrag({ ...drag, y, to: dropIndex(drag.centres, y) })
      return
    }
    const start = pressStart.current
    // Before the long-press lands, a real move means the finger is scrolling
    // the page. Let it — a reorder that hijacks scroll is the failure mode
    // that makes hand-rolled dragging feel broken.
    if (start && Math.abs(event.clientY - start.y) > SCROLL_SLOP_PX) cancelPress()
  }

  function onGripUp() {
    cancelPress()
    if (!drag) return
    if (drag.to !== drag.from) onReorder(moveItem(order, drag.from, drag.to))
    setDrag(null)
  }

  /** How far a block slides while a neighbour is dragged over it. */
  function shiftFor(index: number): number {
    if (!drag) return 0
    if (index === drag.from) return drag.y - drag.startY
    const lifted = drag.heights[drag.from] ?? ROW_HEIGHT
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -lifted
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return lifted
    return 0
  }

  // Consecutive blocks sharing a superset group are drawn under one rail.
  const runs: OverviewBlock[][] = []
  for (const block of blocks) {
    const last = runs.at(-1)
    if (
      last &&
      block.supersetGroup !== null &&
      last[0].supersetGroup === block.supersetGroup
    ) {
      last.push(block)
    } else {
      runs.push([block])
    }
  }

  let index = -1

  return (
    <ul className="flex flex-col gap-3">
      {runs.map((run) => {
        const group = run[0].supersetGroup
        const grouped = group !== null && run.length > 1
        const round = grouped ? supersetRound(run) : null
        return (
          <li key={run[0].exerciseId}>
            {round && (
              <p className="kicker mb-1.5 ps-3">
                {t('overview.superset_round', {
                  round: String(round.round),
                  total: String(round.total),
                })}
              </p>
            )}
            <ul
              className="flex flex-col gap-3"
              // 2px solid amber, not knurl: §2.4 reserves the texture for thin
              // bands and the PR badge, and a rail is structure. It spans from
              // the first block's header to the last block's final row, which
              // is what makes round-rest visible for the first time.
              style={
                grouped
                  ? {
                      borderInlineStart: '2px solid var(--color-accent)',
                      paddingInlineStart: 11,
                    }
                  : undefined
              }
            >
              {run.map((block) => {
                index += 1
                const i = index
                const shift = shiftFor(i)
                const dragging = drag?.from === i
                return (
                  <li
                    key={block.exerciseId}
                    ref={(node) => {
                      if (node) itemRefs.current.set(block.exerciseId, node)
                      else itemRefs.current.delete(block.exerciseId)
                    }}
                    className="bg-surface"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      boxShadow: dragging
                        ? 'var(--ring-hairline)'
                        : '0 0 0 1px transparent',
                      background: dragging ? 'var(--color-raised)' : undefined,
                      transform: shift ? `translateY(${shift}px)` : undefined,
                      transition: dragging
                        ? 'none'
                        : 'transform var(--motion-transition) var(--motion-ease)',
                      position: dragging ? 'relative' : undefined,
                      zIndex: dragging ? 10 : undefined,
                      touchAction: dragging ? 'none' : undefined,
                    }}
                  >
                    <BlockHeader
                      block={block}
                      menuOpen={openMenu === block.exerciseId}
                      onToggleMenu={() =>
                        setOpenMenu((id) =>
                          id === block.exerciseId ? null : block.exerciseId,
                        )
                      }
                      onGripDown={(e) => onGripDown(e, i)}
                      onGripMove={onGripMove}
                      onGripUp={onGripUp}
                    />

                    {openMenu === block.exerciseId && (
                      <BlockMenu
                        block={block}
                        canMoveUp={i > 0}
                        canMoveDown={i < order.length - 1}
                        onTellCoach={
                          onTellCoach
                            ? () => {
                                setOpenMenu(null)
                                onTellCoach(block.exerciseId)
                              }
                            : undefined
                        }
                        onMove={(delta) => onReorder(moveItem(order, i, i + delta))}
                        onSaveNote={(note) => onSaveNote(block.exerciseId, note)}
                        onSaveRest={(s) => onSaveRest(block.exerciseId, s)}
                        onUngroup={
                          block.supersetGroup !== null
                            ? () => {
                                setOpenMenu(null)
                                onUngroup(block.exerciseId)
                              }
                            : undefined
                        }
                        onRemove={() => {
                          setOpenMenu(null)
                          onRemove(block.exerciseId)
                        }}
                      />
                    )}

                    <ul className="flex flex-col px-2 pb-2">
                      {block.rows.map((row, rowIndex) => (
                        <SetRow
                          key={row.key}
                          nodeRef={(node) => {
                            if (node) rowRefs.current.set(row.key, node)
                            else rowRefs.current.delete(row.key)
                          }}
                          row={row}
                          unit={unit}
                          busy={busy}
                          first={rowIndex === 0}
                          exerciseName={block.exercise?.name ?? 'this exercise'}
                          editing={editingKey === row.key}
                          // One reasoning chip per BLOCK, on the first ghost.
                          // "One chip per row maximum" is the ceiling; a
                          // column of four identical chips saying the same
                          // thing is the noise the once-per-cause rule exists
                          // to prevent, so the later ghosts stay quiet.
                          verdict={
                            row.kind === 'ghost' &&
                            block.rows.findIndex((r) => r.kind === 'ghost') === rowIndex
                              ? (block.verdict ?? null)
                              : null
                          }
                          onExplain={
                            onExplain ? () => onExplain(block.exerciseId) : undefined
                          }
                          onCommit={() => onCommit(block.exerciseId, row)}
                          onOpen={() => onOpenRow(block.exerciseId, row)}
                        />
                      ))}

                      {block.committed === 0 &&
                        block.rows.length === 1 &&
                        block.rows[0].reps === null && (
                          <p className="px-1 pt-0.5 text-body text-muted">
                            {t('overview.first_set')}
                          </p>
                        )}

                      {block.committed >= block.planned && (
                        <button
                          type="button"
                          onClick={() => onAddGhost(block.exerciseId)}
                          className="btn-base btn-quiet h-12 w-full justify-start px-2 text-label"
                        >
                          {t('overview.add_set')}
                        </button>
                      )}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function BlockHeader({
  block,
  menuOpen,
  onToggleMenu,
  onGripDown,
  onGripMove,
  onGripUp,
}: {
  block: OverviewBlock
  menuOpen: boolean
  onToggleMenu: () => void
  onGripDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  onGripMove: (event: React.PointerEvent<HTMLButtonElement>) => void
  onGripUp: () => void
}) {
  const { t } = useLocale()
  const name = block.exercise?.name ?? t('overview.exercise_fallback')
  const complete = block.committed >= block.planned && block.planned > 0
  return (
    <div className="px-1 pt-1">
      <div className="flex items-center">
        {/* An explicit handle, and the only place a drag starts. Because it is
            explicit, a drag anywhere else in the block still scrolls the page —
            which is the failure mode that makes hand-rolled reordering feel
            broken. `touch-action: none` keeps the browser from claiming the
            gesture once the long-press has landed. */}
        <button
          type="button"
          aria-label={t('overview.reorder', { name })}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          className="flex h-[52px] w-11 shrink-0 items-center justify-center text-muted"
          style={{ touchAction: 'none' }}
        >
          <span aria-hidden="true" className="flex flex-col gap-[3px]">
            <span className="block h-px w-[14px] bg-current" />
            <span className="block h-px w-[14px] bg-current" />
            <span className="block h-px w-[14px] bg-current" />
          </span>
        </button>

        {/* The board was the only surface that showed a lift without its
            picture: History, Progress, the picker, the detail page, the finish
            summary and the routine editor all had one. Mid-workout is where
            recognising the next lift at a glance matters most. 36px rather
            than the 48px default because this row is dense and its height is
            set by the 52px controls either side of it. */}
        {block.exercise && (
          <span className="me-2 shrink-0">
            <ExerciseThumb exercise={block.exercise} size={36} />
          </span>
        )}

        {/* The name gets the whole header row. With the progress count sharing
            the line, "Bench Press (Barbell)" and "Lat Pulldown (Cable)" — the
            two most common lifts in this app — both truncated. Identity does
            not share a line. */}
        <h3 className="min-w-0 flex-1 truncate text-title">{name}</h3>

        <button
          type="button"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-label={t('overview.more', { name })}
          className="flex h-[52px] w-12 shrink-0 items-center justify-center text-muted"
        >
          <IconMore size={18} />
        </button>
      </div>

      {/* The meta line always exists, because progress always exists — so a
          block with a note and a block without are the same height. */}
      <p className="mb-1 ms-[88px] flex min-w-0 items-baseline gap-1.5 pe-2">
        <span
          dir="ltr"
          className={`tnum shrink-0 font-mono text-meta ${
            complete ? 'text-accent-300' : 'text-muted'
          }`}
        >
          {block.committed} / {block.planned}
        </span>
        {/* v3 §02's `2 / 4 · coach adjusted today`. It sits BEFORE the note
            because it is a fact about the rows directly underneath it, and a
            long user note would otherwise truncate it away. */}
        {block.adjusted && (
          <>
            <span aria-hidden="true" className="shrink-0 text-meta text-muted">
              ·
            </span>
            <span className="shrink-0 font-mono text-meta text-muted">
              {t('overview.coach_adjusted')}
            </span>
          </>
        )}
        {block.note && (
          <>
            <span aria-hidden="true" className="shrink-0 text-meta text-muted">
              ·
            </span>
            <span className="truncate text-label text-muted">{block.note}</span>
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Everything that is not logging. Two taps from anything that commits a set,
 * and the destructive one is armed on top of that.
 */
function BlockMenu({
  block,
  canMoveUp,
  canMoveDown,
  onMove,
  onSaveNote,
  onSaveRest,
  onUngroup,
  onRemove,
  onTellCoach,
}: {
  block: OverviewBlock
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: number) => void
  onSaveNote: (note: string) => void
  onSaveRest: (seconds: number) => void
  onUngroup?: () => void
  onRemove: () => void
  /** v3 §07: "behind the `⋮` on the exercise block". */
  onTellCoach?: () => void
}) {
  const { t } = useLocale()
  const [note, setNote] = useState(block.note ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const noteId = `note-${block.exerciseId}`

  useEffect(() => {
    if (!confirmRemove) return
    const id = setTimeout(() => setConfirmRemove(false), 4000)
    return () => clearTimeout(id)
  }, [confirmRemove])

  return (
    <div className="mx-2 mb-2 flex flex-col gap-2 border-t border-line pt-2">
      {/* First in the menu, because it is the only item here that is about
          the set you are in the middle of. Everything below it is
          housekeeping. */}
      {onTellCoach && (
        <button
          type="button"
          onClick={onTellCoach}
          className="btn-base btn-secondary h-12 w-full justify-start px-3 text-label"
        >
          {t('tell.open')}
        </button>
      )}
      <div>
        <label htmlFor={noteId} className="mb-1 block text-label text-muted">
          {t('overview.note_label')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('overview.note.placeholder')}
            className="h-12 min-w-0 flex-1 border border-line bg-ink px-3 field-text outline-none placeholder:text-muted focus:border-accent"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <button
            type="button"
            onClick={() => onSaveNote(note.trim())}
            disabled={note.trim() === (block.note ?? '')}
            className="btn-base btn-secondary h-12 shrink-0 px-3 text-label disabled:opacity-45"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-label text-muted">{t('overview.rest')}</span>
        <button
          type="button"
          aria-label={t('overview.rest.shorter')}
          onClick={() => onSaveRest(stepRest(block.restSeconds, -1, REST_STEP_SECONDS))}
          className="btn-base btn-secondary h-12 w-12 text-num"
        >
          −
        </button>
        <span className="tnum font-display w-12 text-center text-body font-medium">
          {describeRest(block.restSeconds)}
        </span>
        <button
          type="button"
          aria-label={t('overview.rest.longer')}
          disabled={block.restSeconds >= REST_MAX_SECONDS}
          onClick={() => onSaveRest(stepRest(block.restSeconds, 1, REST_STEP_SECONDS))}
          className="btn-base btn-secondary h-12 w-12 text-num disabled:opacity-45"
        >
          +
        </button>
      </div>

      {/* The keyboard and screen-reader path to the same thing the grip does.
          A long-press drag is not reachable without a pointer, and reordering
          is not decoration. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="btn-base btn-secondary h-12 px-3 text-label disabled:opacity-45"
        >
          {t('overview.move_up')}
        </button>
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="btn-base btn-secondary h-12 px-3 text-label disabled:opacity-45"
        >
          {t('overview.move_down')}
        </button>
        {onUngroup && (
          <button
            type="button"
            onClick={onUngroup}
            className="btn-base btn-secondary h-12 px-3 text-label"
          >
            {t('overview.unsuperset')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirmRemove) onRemove()
            else setConfirmRemove(true)
          }}
          className={`btn-base ms-auto h-12 px-3 text-label ${
            confirmRemove ? 'btn-primary' : 'btn-quiet'
          }`}
        >
          {confirmRemove
            ? block.committed > 0
              ? t('overview.remove.confirm_sets')
              : t('overview.remove.confirm')
            : t('overview.remove')}
        </button>
      </div>
    </div>
  )
}

/**
 * One row — design v3.0 §02: `26px | 1fr | auto | 44px`, 54px tall.
 *
 * ── WHAT CHANGED FROM v2.2, AND WHAT DID NOT ────────────────────────────────
 * The anatomy is the same and GATE U2 is untouched: **the check still commits
 * the row exactly as shown, in one tap.** What changed is how a ghost is
 * distinguished from a committed row. v2.2 drew a dashed outline around the
 * whole ghost; v3 draws a dashed DIVIDER above it and drops the figure to the
 * ghost tier, so a block reads as one column with the plan hanging off the
 * bottom rather than as a stack of boxes.
 *
 * ── WHY FOUR CELLS AND NOT ONE BIG BUTTON ───────────────────────────────────
 * v2.2 made the figure and the previous-value one tap target — "a target that
 * size cannot be missed with chalk on your hands", and that reasoning still
 * holds for the figure, which keeps the whole 1fr column. But v3's reasoning
 * chip is itself a control (it opens the explainer), and a button inside a
 * button is invalid and unreachable by keyboard. So the chip is its own cell,
 * exactly as the design draws it, and the figure loses only the width the chip
 * occupies.
 *
 * ── THE FIGURE NEVER YIELDS ─────────────────────────────────────────────────
 * `102.5 × 8` is what the lifter is here to read. The grid gives the figure
 * `1fr` and the chip `auto`, and the chip carries `min-width: 0` with an
 * ellipsis (see `chip-reason`) — so a long reason shrinks and a long figure
 * does not wrap.
 */
function SetRow({
  nodeRef,
  row,
  unit,
  busy,
  first,
  exerciseName,
  editing,
  verdict,
  onExplain,
  onCommit,
  onOpen,
}: {
  /** Not `ref`: this is React 18, where a function component cannot take one. */
  nodeRef: (node: HTMLLIElement | null) => void
  row: OverviewRow
  unit: Unit
  busy: boolean
  /** The first row in a block draws no divider — the header is its top edge. */
  first: boolean
  exerciseName: string
  editing: boolean
  verdict: GhostVerdict | null
  onExplain?: () => void
  onCommit: () => void
  onOpen: () => void
}) {
  const { t } = useLocale()
  const committed = row.kind === 'committed'
  const record = committed && row.set !== null && isRecord(row.set)
  // Nothing to commit without reps. The check goes quiet rather than lying
  // about what a tap would do; the values are the way in.
  const committable = !committed && row.reps !== null && row.reps > 0
  const speaks = !committed && verdict !== null && verdict.cause !== 'none'

  return (
    <li
      ref={nodeRef}
      className={`grid items-center overflow-hidden ${
        committed ? (record ? 'record-row set-commit' : 'set-commit') : ''
      }`}
      style={{
        gridTemplateColumns: ROW_GRID,
        columnGap: 10,
        minHeight: V3_ROW_HEIGHT,
        paddingInline: 6,
        // Solid above a committed row, dashed above a ghost. Never a hue
        // difference — a lighter day is not an error, and §2.4 has no red.
        borderTop: first
          ? undefined
          : committed
            ? '1px solid var(--divider-solid)'
            : '1px dashed var(--ghost-divider)',
        // The focused view's row keeps its accent edge, drawn as an outline so
        // the row does not shift by a pixel when it lands.
        outline: editing ? '1px solid var(--color-accent)' : undefined,
        outlineOffset: '-1px',
        borderRadius: editing ? 'var(--radius-sm)' : undefined,
      }}
    >
      <span
        className={`tnum flex items-center justify-center font-mono text-meta ${
          row.setType === 'warmup' ? 'text-accent-600' : committed ? 'text-muted' : ''
        }`}
        style={committed ? undefined : { color: 'var(--ghost-ink)' }}
        title={row.setType !== 'normal' ? SET_TYPE_NAME[row.setType] : undefined}
      >
        {row.setType === 'warmup' ? SET_TYPE_LABEL.warmup : row.label}
      </span>

      <button
        type="button"
        onClick={onOpen}
        // A committed row is not editable from here and must not say it is.
        // Correcting a logged set lives in History, behind EditSetDialog —
        // the only place that component is used. What a tap does on the board
        // is open this exercise, which appends the next set, so that is what
        // the name says now.
        aria-label={t(committed ? 'overview.open_logged' : 'overview.open_row', {
          name: exerciseName,
          label: row.label,
          values: values(row.weightKg, row.reps, unit),
        })}
        className="flex h-full min-w-0 items-center gap-2 text-start"
      >
        <span
          dir="ltr"
          className="font-display tnum min-w-0 truncate text-num font-medium"
          // `nowrap` is the design's own rule for this span. The chip is what
          // yields when the row runs out of room, never the figure.
          style={{
            whiteSpace: 'nowrap',
            color: committed ? 'var(--color-text)' : 'var(--ghost-ink)',
          }}
        >
          {values(row.weightKg, row.reps, unit)}
        </span>

        {record && (
          <span className="tag-pr h-[22px] shrink-0" title={t('overview.pr')}>
            PR
          </span>
        )}

        {row.setType !== 'normal' && row.setType !== 'warmup' && (
          <span
            className="tag-neutral h-6 w-6 shrink-0"
            title={SET_TYPE_NAME[row.setType]}
          >
            {SET_TYPE_LABEL[row.setType]}
          </span>
        )}
      </button>

      {speaks && onExplain ? (
        <button
          type="button"
          onClick={onExplain}
          aria-label={t('reason.open', { name: exerciseName })}
          className="press flex h-full min-w-0 items-center justify-end"
        >
          <ReasonChip verdict={verdict} unit={unit} />
        </button>
      ) : speaks ? (
        <ReasonChip verdict={verdict} unit={unit} />
      ) : (
        <Previous row={row} unit={unit} />
      )}

      {committed ? (
        // Not a button. There is no per-set correction from here (that is a
        // documented non-goal), so a control that does nothing would be worse
        // than a mark that says the row is done.
        <span
          role="img"
          aria-label={t('overview.logged')}
          className="flex h-full items-center justify-end"
        >
          <span
            aria-hidden="true"
            className="flex h-[26px] w-[26px] items-center justify-center bg-accent text-body font-bold text-accent-ink"
            style={{ borderRadius: 7 }}
          >
            ✓
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || !committable}
          aria-label={
            committable
              ? t('overview.log_row', {
                  name: exerciseName,
                  label: row.label,
                  values: values(row.weightKg, row.reps, unit),
                })
              : t('overview.row_needs_reps', { label: row.label })
          }
          // The design's 44px column, on a 54px row: 44 × 54 of target for the
          // one control GATE U2 measures. The drawn box stays 26px.
          className="press flex h-full items-center justify-end disabled:opacity-40"
        >
          <span
            aria-hidden="true"
            className="block h-[26px] w-[26px]"
            style={{
              borderRadius: 'var(--radius-check)',
              border: `1.5px solid ${
                editing ? 'var(--color-accent)' : 'var(--ghost-divider)'
              }`,
            }}
          />
        </button>
      )}
    </li>
  )
}

/**
 * The reasoning chip — what the coach did to this ghost, in one span.
 *
 * Raised reads in the accent; held and eased read muted. That is the design's
 * own rule and it is doing real work: a raise is a claim about the lifter
 * getting stronger and deserves the one colour in the app, while an ease is a
 * fact about today and must not look like a warning. There is no red anywhere
 * to reach for even if somebody wanted one.
 */
function ReasonChip({ verdict, unit }: { verdict: GhostVerdict; unit: Unit }) {
  const { t } = useLocale()
  const w = (kg: number | null) => (kg === null ? '—' : formatWeight(kg, unit))

  const text =
    verdict.cause === 'under-plan'
      ? t('reason.chip.eased', {
          weight: w(verdict.weightKg),
          label: verdict.facts.causeSetLabel ?? '',
        })
      : verdict.cause === 'progression'
        ? t('reason.chip.raised', {
            weight: w(verdict.weightKg),
            run: (verdict.facts.previousRepsRun ?? []).join('/'),
          })
        : verdict.cause === 'readiness'
          ? t('reason.chip.hold')
          : t('reason.chip.reps', { reps: String(verdict.reps ?? '') })

  // Raised is the one that gets the accent; everything else is the muted step
  // of the same chip, which keeps "one chip per row" true without giving an
  // ease-off the visual weight of a personal record.
  const raised = verdict.kind === 'raise'

  return (
    <span
      dir="ltr"
      className="chip-reason"
      style={
        raised
          ? undefined
          : { background: 'transparent', color: 'var(--color-muted)', paddingInline: 0 }
      }
    >
      {text}
    </span>
  )
}

/**
 * Last time, on every row. This is the retention engine — seeing the number to
 * beat is what turns a session into a game against yourself — and it costs one
 * query the app already makes.
 *
 * On a committed row it becomes the comparison. Never red when the weight is
 * down: a lighter day is not a failure, and §2.4 has no red at all.
 */
function Previous({ row, unit }: { row: OverviewRow; unit: Unit }) {
  const { t } = useLocale()
  if (row.kind === 'committed') {
    // v3 §02: a set that came in under its target says so, muted, in the same
    // slot. It outranks the load delta because it is the more recent and more
    // actionable fact — and because it is what the auto-regulation downstream
    // is about to act on, so the board should already have said it.
    //
    // Stated as the plan, never as a shortfall: `→ planned 8`, with the same
    // `→` the matched-weight case uses. There is no vocabulary here for
    // "missed" (doctrine 3), and no colour: it is muted, like a hold.
    if (
      row.plannedReps !== null &&
      row.reps !== null &&
      row.reps < row.plannedReps &&
      row.setType !== 'warmup'
    ) {
      return (
        <span dir="ltr" className="tnum shrink-0 font-mono text-meta text-muted">
          {t('overview.under_plan', { reps: String(row.plannedReps) })}
        </span>
      )
    }
    if (row.delta === null) return null
    if (row.delta === 0) {
      return (
        <span
          className="shrink-0 font-mono text-meta text-muted"
          aria-label={t('overview.matched')}
        >
          →
        </span>
      )
    }
    const up = row.delta > 0
    return (
      <span
        dir="ltr"
        className={`tnum shrink-0 font-mono text-meta ${
          up ? 'text-accent-300' : 'text-muted'
        }`}
        aria-label={`${up ? 'Up' : 'Down'} ${formatWeight(Math.abs(row.delta), unit)} ${unit} on last session`}
      >
        {up ? '▲' : '▼'} {up ? '+' : '−'}
        {formatWeight(Math.abs(row.delta), unit)}
      </span>
    )
  }

  // The `↺ previous` glyph remains when the AI has nothing to say — v3 keeps
  // v2.2's honest silence rather than filling the slot.
  if (!row.previous) return null
  return (
    <span
      dir="ltr"
      className="tnum shrink-0 font-mono text-meta"
      style={{ color: 'var(--ghost-ink)' }}
      aria-label={t('overview.last_session', {
        values: values(row.previous.weightKg, row.previous.reps, unit),
      })}
    >
      {/*
        `icon-start` mirrors with `scaleX(-1)`, so it must wrap the GLYPH and
        nothing else. It used to sit on the parent span, which mirrored the
        numbers too: "24 × 15" rendered backwards on every ghost row in Arabic,
        on the logging board, which is the hot path. `inline-block` because a
        transform does not apply to an inline box.
      */}
      <span aria-hidden="true" className="icon-start inline-block">
        ↺
      </span>{' '}
      {values(row.previous.weightKg, row.previous.reps, unit)}
    </span>
  )
}
