import type { WorkoutSummary } from './summary'
import type { Unit } from './units'
import { formatWeight } from './units'
import { formatCount, formatVolume } from './format'
import {
  LATIN_BAR_D,
  LATIN_H,
  LATIN_LETTERS_D,
  LATIN_PLATE_D,
  LATIN_X,
  LATIN_Y,
} from '../components/wordmark-latin-paths'

/**
 * Renders the post-workout summary to a PNG and hands it to the native share
 * sheet. This is the only organic growth surface before Stage 3, so it has to
 * look like the app, not like a screenshot of a spreadsheet.
 *
 * Canvas rather than a library: html2canvas and friends are 40-200 kB for one
 * image a user shares occasionally, and the Log screen is the hot path.
 * Everything here is drawn with primitives already in the browser.
 */

// 4:5, per design v2.1 — the aspect a phone feed gives the most height to,
// and the one a screenshot of it stays sharp in.
const W = 1080
const H = 1350
// Pure tokens, matching src/index.css, so the export is pixel-identical to the
// in-app preview rather than a near-miss rendered by a second set of values.
// v3 "The Plate" values. The card stays ink-grounded — a shared image lands in
// somebody else's feed, and the dark plate is what makes it read as ours
// rather than as a screenshot — but ink, bone and the muted greys are the
// redesign's, not v2's cool-grey set.
const INK = '#16130e'
const TEXT = '#f7f3ec'
const MUTED = '#9d968a'
const ACCENT = '#e8491d'
const ACCENT_700 = '#9a3012'
const LINE = 'rgba(247, 243, 236, 0.1)'
const FONT = "'Hanken Grotesk', system-ui, sans-serif"
const DISPLAY = "'Sora', system-ui, sans-serif"
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

function hms(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * The knurl, as a canvas fill: cross-hatched amber at plus/minus 45 degrees on
 * a 5px period, the same geometry as the CSS utility. Drawn rather than
 * imported so the card has no image dependency and cannot 404.
 */
function knurlBand(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  c.save()
  c.beginPath()
  c.rect(x, y, w, h)
  c.clip()
  c.fillStyle = 'rgba(232, 73, 29, 0.16)'
  c.fillRect(x, y, w, h)
  c.strokeStyle = 'rgba(232, 73, 29, 0.7)'
  c.lineWidth = 2
  const period = 10
  for (let i = -h; i < w + h; i += period) {
    c.beginPath()
    c.moveTo(x + i, y)
    c.lineTo(x + i + h, y + h)
    c.stroke()
    c.beginPath()
    c.moveTo(x + i + h, y)
    c.lineTo(x + i, y + h)
    c.stroke()
  }
  c.restore()
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  summary: WorkoutSummary,
  unit: Unit,
  dateLabel: string,
  options: { name?: string; streakWeeks?: number } = {},
): void {
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')
  if (!c) return

  c.fillStyle = INK
  c.fillRect(0, 0, W, H)
  c.textBaseline = 'top'

  const M = 88

  // ── Wordmark ────────────────────────────────────────────────────────────
  // The mark itself, not its name set in a UI font: this is the only organic
  // growth surface, so it carries the actual brand object. Same paths the
  // Wordmark component renders, via Path2D.
  //
  // The Latin lockup in every locale, unlike the in-app header. A share card
  // is read by people who are not the lifter and may not read Arabic, and it
  // is the one place the mark has to survive being seen once, small, by a
  // stranger. The وزن barbell keeps the surfaces that are the owner's own.
  const markH = 52
  const k = markH / LATIN_H
  c.save()
  // The lockup's coordinates are its own; canvas has no viewBox, so the
  // translate has to undo the origin as well as place the mark.
  c.translate(M - LATIN_X * k, 96 - LATIN_Y * k)
  c.scale(k, k)
  c.fillStyle = TEXT
  c.fill(new Path2D(LATIN_LETTERS_D))
  c.fillStyle = ACCENT
  c.fill(new Path2D(LATIN_PLATE_D), 'evenodd')
  c.fill(new Path2D(LATIN_BAR_D))
  c.restore()

  // ── The hero figure ─────────────────────────────────────────────────────
  // v2.1: "If a PR fell, the PR replaces volume as the hero number." A record
  // is the rarer and more interesting fact, and the card exists to be
  // interesting to somebody who is not the person who lifted it.
  const topPr = summary.prs[0]
  // A PR keeps `formatWeight`'s precision — it is a bar load, and 102.5 is a
  // different lift from 102. Volume is grouped and whole; see `formatVolume`.
  const heroValue = topPr
    ? formatWeight(topPr.value, unit)
    : formatVolume(summary.totalVolumeKg, unit)
  const heroKicker = topPr
    ? `New best · ${topPr.exerciseName}`
    : `Moved · ${dateLabel} · ${hms(summary.durationSeconds)}`

  let y = 360
  c.fillStyle = TEXT
  c.font = `600 168px ${DISPLAY}`
  c.fillText(heroValue, M, y)
  y += 200

  c.fillStyle = MUTED
  c.font = `500 34px ${MONO}`
  c.fillText(heroKicker.toUpperCase(), M, y)
  y += 96

  // ── Knurl divider ───────────────────────────────────────────────────────
  knurlBand(c, M, y, W - M * 2, 8)
  y += 88

  // ── Three-stat grid ─────────────────────────────────────────────────────
  const stats: [string, string][] = [
    [formatCount(summary.setCount), 'Sets'],
    [formatCount(summary.prs.length), summary.prs.length === 1 ? 'PR' : 'PRs'],
    [
      options.streakWeeks ? `${options.streakWeeks} wk` : hms(summary.durationSeconds),
      options.streakWeeks ? 'Streak' : 'Duration',
    ],
  ]
  const colW = (W - M * 2) / 3
  stats.forEach(([value, label], i) => {
    const x = M + colW * i
    c.fillStyle = TEXT
    c.font = `600 76px ${DISPLAY}`
    c.fillText(value, x, y)
    c.fillStyle = MUTED
    c.font = `400 32px ${FONT}`
    c.fillText(label, x, y + 92)
  })

  // ── Footer ──────────────────────────────────────────────────────────────
  // Name and date on the inline start, the URL on the end. The URL is the only
  // marketing copy on the plate: quiet here, legible in a feed.
  const footerY = H - 96
  c.strokeStyle = LINE
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(M, footerY - 40)
  c.lineTo(W - M, footerY - 40)
  c.stroke()

  c.fillStyle = MUTED
  c.font = `400 30px ${MONO}`
  const who = [options.name, dateLabel].filter(Boolean).join(' · ').toUpperCase()
  c.fillText(who, M, footerY)

  c.fillStyle = ACCENT_700
  c.textAlign = 'right'
  c.fillText('TRYWAZN.APP', W - M, footerY)
  c.textAlign = 'left'
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
