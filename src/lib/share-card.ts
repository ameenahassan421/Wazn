import type { WorkoutSummary } from './summary'
import type { Unit } from './units'
import { formatWeight } from './units'
import {
  DOT_D,
  LETTERS_D,
  LETTER_STROKE,
  MARK_H,
  SHAFT,
} from '../components/wordmark-paths'

/**
 * Renders the post-workout summary to a PNG and hands it to the native share
 * sheet. This is the only organic growth surface before Stage 3, so it has to
 * look like the app, not like a screenshot of a spreadsheet.
 *
 * Canvas rather than a library: html2canvas and friends are 40-200 kB for one
 * image a user shares occasionally, and the Log screen is the hot path.
 * Everything here is drawn with primitives already in the browser.
 */

const W = 1080
const H = 1080
const INK = '#0b0b0c'
const TEXT = '#ececee'
const MUTED = '#8a8a92'
const ACCENT = '#f0b429'
const LINE = '#26262a'

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function hms(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  summary: WorkoutSummary,
  unit: Unit,
  dateLabel: string,
): void {
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')
  if (!c) return

  c.fillStyle = INK
  c.fillRect(0, 0, W, H)

  // The mark itself, not its name in Inter: the share card is the only
  // organic growth surface, so it carries the actual brand object. Same
  // paths the Wordmark component renders, via Path2D.
  const markH = 96
  const k = markH / MARK_H
  c.save()
  c.translate(80, 72)
  c.scale(k, k)
  c.strokeStyle = ACCENT
  c.lineWidth = SHAFT.t
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(SHAFT.x0, SHAFT.y)
  c.lineTo(SHAFT.x1, SHAFT.y)
  c.stroke()
  const letters = new Path2D(LETTERS_D)
  c.fillStyle = TEXT
  c.strokeStyle = TEXT
  c.lineWidth = LETTER_STROKE
  c.lineJoin = 'round'
  c.fill(letters)
  c.stroke(letters)
  c.fill(new Path2D(DOT_D), 'evenodd')
  c.restore()

  c.textBaseline = 'top'
  c.fillStyle = MUTED
  c.font = '36px Inter, system-ui, sans-serif'
  c.fillText(dateLabel, 80, 72 + markH + 24)

  // Three headline numbers. Volume is the one people compare, so it leads.
  const stats: [string, string][] = [
    [formatWeight(summary.totalVolumeKg, unit), `volume (${unit})`],
    [hms(summary.durationSeconds), 'duration'],
    [String(summary.setCount), summary.setCount === 1 ? 'set' : 'sets'],
  ]

  let y = 300
  for (const [value, label] of stats) {
    c.fillStyle = TEXT
    c.font = 'bold 110px Inter, system-ui, sans-serif'
    c.fillText(value, 80, y)
    c.fillStyle = MUTED
    c.font = '34px Inter, system-ui, sans-serif'
    c.fillText(label, 84, y + 124)
    y += 200
  }

  // PRs, if any. Amber is the only colour in the app and this is what it is for.
  if (summary.prs.length > 0) {
    const boxY = 900
    c.strokeStyle = ACCENT
    c.lineWidth = 3
    roundRect(c, 80, boxY - 24, W - 160, 128, 16)
    c.stroke()

    c.fillStyle = ACCENT
    c.font = 'bold 40px Inter, system-ui, sans-serif'
    const headline =
      summary.prs.length === 1
        ? '1 personal record'
        : `${summary.prs.length} personal records`
    c.fillText(headline, 112, boxY)

    c.fillStyle = MUTED
    c.font = '32px Inter, system-ui, sans-serif'
    const names = summary.prs
      .map((p) => p.exerciseName)
      .slice(0, 2)
      .join(', ')
    const more = summary.prs.length > 2 ? ` +${summary.prs.length - 2}` : ''
    c.fillText(`${names}${more}`, 112, boxY + 56)
  } else {
    c.strokeStyle = LINE
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(80, 920)
    c.lineTo(W - 80, 920)
    c.stroke()
    c.fillStyle = MUTED
    c.font = '32px Inter, system-ui, sans-serif'
    c.fillText(`${summary.exerciseCount} exercises`, 80, 950)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export type ShareOutcome = 'shared' | 'downloaded' | 'failed'

/**
 * Share sheet if the browser has one, download otherwise. Desktop Chrome and
 * Firefox have no `canShare({files})`, and silently doing nothing there would
 * read as a broken button.
 */
export async function shareCard(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<ShareOutcome> {
  const blob = await canvasToBlob(canvas)
  if (!blob) return 'failed'

  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      // AbortError means the user closed the sheet; that is not a failure and
      // must not show an error.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      // Anything else falls through to a download rather than dead-ending.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
