import type { WorkoutSummary } from './summary'
import type { Unit } from './units'
import { formatWeight } from './units'
import { formatCount, formatVolume } from './format'
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

// 4:5, per design v2.1 — the aspect a phone feed gives the most height to,
// and the one a screenshot of it stays sharp in.
const W = 1080
const H = 1350
// Pure tokens, matching src/index.css, so the export is pixel-identical to the
// in-app preview rather than a near-miss rendered by a second set of values.
//
// That claim was already false before v5: MUTED sat at #8a8a92 and LINE at
// #26262a while the stylesheet had moved to #8d8983 and #2a2825. Canvas cannot
// read a custom property, so this list is a hand-kept copy and it drifts
// silently. It is now correct, and the only defence against the next drift is
// that a share card is on LAUNCH.md §4.
const INK = '#0f0d0a'
const TEXT = '#ece7dc'
const MUTED = '#9a927f'
const ACCENT = '#e8491d'
// The footer URL: quiet, but legible in a feed. NOT the ember ramp's 700 slot,
// which is where amber's #977018 sat. Ember is a much darker hue at equal
// chroma, so ember-700 on the v5 ground is 2.65:1 against amber-700's 4.35:1 on
// the old ground — the same index, a nearly invisible URL. Ember-600 is 3.64:1
// and still reads dimmer than the mark's shaft, which is the hierarchy the
// original was after. Role preserved, index abandoned.
const ACCENT_QUIET = '#c43910'
// `line-2` flattened onto the ground. This is a drawn rule, not an elevation
// ring, so it takes the heavier of the two line weights; canvas has no alpha
// compositing against a token, so the blend is precomputed.
const LINE = '#32302c'
// Saira for every figure, Hanken for every word, Mono for the meta voice —
// the same three-face split the app uses. The plate's giant number is the one
// place a share card has a `hero`, so it is set in the display face.
const DISPLAY = "'Saira Semi Condensed', system-ui, sans-serif"
const FONT = "'Hanken Grotesk', system-ui, sans-serif"
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

function hms(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * The knurl, as a canvas fill: cross-hatched at plus/minus 45 degrees on a 5px
 * period, the same geometry as the CSS utility. Drawn rather than imported so
 * the card has no image dependency and cannot 404.
 *
 * Warm neutral ink, matching the utility. It was amber, and ember at the same
 * alpha reads as a red hazard stripe rather than as cut metal — see the knurl
 * comment in index.css for the screenshot that found it.
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
  c.fillStyle = 'rgba(236, 231, 220, 0.06)'
  c.fillRect(x, y, w, h)
  c.strokeStyle = 'rgba(236, 231, 220, 0.26)'
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
  const markH = 88
  const k = markH / MARK_H
  c.save()
  c.translate(M, 96)
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
  c.font = `700 168px ${DISPLAY}`
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

  c.fillStyle = ACCENT_QUIET
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
