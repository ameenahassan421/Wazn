import { useEffect, useState } from 'react'
import type { Routine } from '../lib/types'
import { dueRoutine } from '../lib/rotation'
import type { RoutineWithRun } from '../lib/rotation'
import { IconMore } from './icons'
import { useLocale } from '../lib/locale-context'

/**
 * Routines on the idle Log screen, above "Start empty workout".
 *
 * Not a fourth tab. CLAUDE.md fixes the app at three screens, and a routine is
 * a way to *start* a workout rather than a place you go — putting it here means
 * the thing you tap to begin is the thing you were already looking at. See
 * DECISIONS.md.
 *
 * A row's one job is starting that workout, so the row carries the name and
 * nothing else. Housekeeping — edit, duplicate, delete — sits behind one ⋯
 * per row rather than three permanent text buttons: those made every routine
 * read as a settings row, and put a naked one-tap delete on the home screen.
 *
 * Rows arrive in rotation order (`lib/rotation.ts`), and the head of it is
 * labelled. Before L9 this list was in stored `position` order while the
 * briefing card above it said "Core & Conditioning is up" — a card naming a
 * day the list did not reflect, so the obvious tap was the wrong one.
 */
export function RoutineList({
  routines,
  busyId,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
  onNew,
  onGenerate,
}: {
  routines: RoutineWithRun[]
  busyId: string | null
  onStart: (routine: Routine) => void
  onEdit: (routine: Routine) => void
  onDuplicate: (routine: Routine) => void
  onDelete: (routine: Routine) => void
  onNew: () => void
  onGenerate: () => void
}) {
  const { t } = useLocale()
  const due = dueRoutine(routines)
  const [actionsFor, setActionsFor] = useState<string | null>(null)
  // Delete needs a second tap; the armed state relaxes on its own.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  useEffect(() => {
    if (confirmDelete === null) return
    const id = setTimeout(() => setConfirmDelete(null), 4000)
    return () => clearTimeout(id)
  }, [confirmDelete])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="kicker flex-1">{t('routines.title')}</h2>
        <button
          type="button"
          onClick={onGenerate}
          className="btn-base btn-secondary h-12 px-4 text-sm"
        >
          {t('routines.generate')}
        </button>
        <button
          type="button"
          onClick={onNew}
          className="btn-base btn-secondary h-12 px-4 text-sm"
        >
          {t('routines.new')}
        </button>
      </div>

      {routines.length === 0 ? (
        <p className="text-sm text-muted">{t('routines.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((routine) => {
            const busy = busyId === routine.id
            const open = actionsFor === routine.id
            return (
              <li
                key={routine.id}
                className="ring-edge bg-surface"
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                <div className="flex items-center ps-[13px]">
                  <button
                    type="button"
                    onClick={() => onStart(routine)}
                    disabled={busyId !== null}
                    className={`flex h-14 flex-1 items-center gap-2 overflow-hidden text-start text-[15px] font-medium ${
                      busy ? 'text-accent-300' : ''
                    }`}
                  >
                    <span className="truncate">
                      {busy ? t('routines.starting') : routine.name}
                    </span>
                    {/* A label, not a second hero button: the accent carries
                        the meaning and "Start workout" below stays the only
                        filled control on the screen (§2.4). */}
                    {due?.id === routine.id && !busy && (
                      <span className="kicker shrink-0 text-accent-300">
                        {t('routines.up_next')}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(null)
                      setActionsFor(open ? null : routine.id)
                    }}
                    disabled={busyId !== null}
                    aria-label={`Actions for ${routine.name}`}
                    aria-expanded={open}
                    className="btn-base btn-quiet h-14 w-12 shrink-0"
                  >
                    <IconMore size={20} />
                  </button>
                </div>

                {open && (
                  <div className="flex items-center gap-1 border-t border-line px-2 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsFor(null)
                        onEdit(routine)
                      }}
                      disabled={busyId !== null}
                      className="btn-base btn-quiet h-12 flex-1 text-sm"
                    >
                      {t('routines.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsFor(null)
                        onDuplicate(routine)
                      }}
                      disabled={busyId !== null}
                      className="btn-base btn-quiet h-12 flex-1 text-sm"
                    >
                      {t('routines.duplicate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDelete === routine.id) {
                          setConfirmDelete(null)
                          setActionsFor(null)
                          onDelete(routine)
                        } else {
                          setConfirmDelete(routine.id)
                        }
                      }}
                      disabled={busyId !== null}
                      className={`btn-base h-12 flex-1 text-sm ${
                        confirmDelete === routine.id ? 'btn-primary' : 'btn-quiet'
                      }`}
                    >
                      {confirmDelete === routine.id
                        ? t('routines.delete.confirm')
                        : t('routines.delete')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
