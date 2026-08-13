"""Generate the Wazn mark: PWA icons, and the paths module the app renders.

    python3 scripts/build_logo.py

The mark is the word وزن composed as a barbell — "Loaded Ink", see
docs/design-philosophy.md. No letter is distorted: none of و ز ن connect,
so the three letters are set on one axis with و and ن as the two weights,
and a single ligature stroke at their base — the shaft — fuses them into
one object, running past both letters like sleeve ends. The ز dot is drawn
as a plate face. Chalk letters, amber iron.

Downloads Aref Ruqaa from Google Fonts and converts the glyphs to outlines.
Run it only when the mark itself changes — the outputs are committed, and
nothing at runtime depends on the font.

Requires `fontTools` and the repo's `sharp` for rasterising:
    pip install fonttools brotli && npm install

Run `npm run format` afterwards: the generated modules are committed, and
Prettier owns their line breaks, so an unformatted generation shows up as a
CI failure rather than as a diff in the mark.
"""

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.misc.transform import Transform

CSS = "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700"
CACHE = Path(__file__).parent / ".aref-ruqaa-700.ttf"


def font_path():
    """Fetch the font once and cache it next to this script (gitignored)."""
    if CACHE.exists():
        return CACHE
    req = urllib.request.Request(CSS, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        css = r.read().decode()
    url = re.search(r"url\((https://[^)]+\.ttf)\)", css)
    if not url:
        sys.exit("could not find a .ttf in the Google Fonts response")
    with urllib.request.urlopen(url.group(1), timeout=60) as r:
        CACHE.write_bytes(r.read())
    return CACHE


font = TTFont(font_path())
upem = font["head"].unitsPerEm
cmap = font.getBestCmap()
gs = font.getGlyphSet()

# v3 "The Plate" palette, from docs/design/v3-plate/Wazn Brand - Logo.dc.html.
# These were the v2 dark values (#0c0b0a / #ecebe8) until the redesign landed;
# they must track src/index.css, or a rasterised icon and the live app disagree
# about what colour the brand is.
INK = "#16130e"
BONE = "#f7f3ec"
ACCENT = "#e8491d"
TEXT = BONE  # letters on an ink ground, the Arabic mark's original role


def glyph_contours(ch):
    """Decomposed contours of one glyph with bboxes (font units, y-up).
    DecomposingRecordingPen matters: the ز dot is a component, and a plain
    RecordingPen silently drops it."""
    rec = DecomposingRecordingPen(gs)
    gs[cmap[ord(ch)]].draw(rec)
    contours, current = [], []
    for op, args in rec.value:
        current.append((op, args))
        if op in ("closePath", "endPath"):
            pts = [p for _, a in current for p in a]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            contours.append(
                {"ops": current, "bbox": (min(xs), min(ys), max(xs), max(ys))}
            )
            current = []
    return contours


WAW = glyph_contours("و")  # one contour: head and tail
ZAY = glyph_contours("ز")  # dot + body
NUN = glyph_contours("ن")  # bowl, dot fused into the same contour

ZAY_DOT = min(ZAY, key=lambda c: (c["bbox"][2] - c["bbox"][0]))
ZAY_BODY = max(ZAY, key=lambda c: (c["bbox"][2] - c["bbox"][0]))


def bbox_of(contours):
    xs0, ys0, xs1, ys1 = zip(*(c["bbox"] for c in contours))
    return min(xs0), min(ys0), max(xs1), max(ys1)


def center(b):
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def place(contours, cx, cy, s):
    """Transform putting the contours' bbox centre at (cx, cy), scaled."""
    bcx, bcy = center(bbox_of(contours))
    return Transform().translate(cx, cy).scale(s, s).translate(-bcx, -bcy)


def compose(end_scale=1.5, zay_scale=0.95, gap=110.0, stroke=40.0, overhang=140.0):
    """The mark's geometry in font units, y-up.

    Study B geometry with the Study D dot: و and ن centred on one axis
    (و dropped so its head straddles the bar — its box centre floats high
    because the tail fills the lower half), ز between them, the shaft
    running past both ends.
    """
    A = 150.0

    wb, zb, nb = bbox_of(WAW), bbox_of([ZAY_BODY]), bbox_of(NUN)
    w_w = (wb[2] - wb[0]) * end_scale
    z_w = (zb[2] - zb[0]) * zay_scale
    n_w = (nb[2] - nb[0]) * end_scale

    # RTL: و rightmost, then ز, then ن.
    x = 0.0
    nun_cx = x + n_w / 2
    x += n_w + gap
    zay_cx = x + z_w / 2
    x += z_w + gap
    waw_cx = x + w_w / 2
    total = x + w_w

    transforms = {
        "waw": place(WAW, waw_cx, A - 85, end_scale),
        "zay": place([ZAY_BODY], zay_cx, A + 60, zay_scale),
        "nun": place(NUN, nun_cx, A, end_scale),
    }

    shaft_t = 100.0 + stroke
    dcx, dcy = center(ZAY_DOT["bbox"])
    dot_t = Transform().translate(zay_cx, A + 60).scale(zay_scale, zay_scale)
    dot_t = dot_t.translate(-center(bbox_of([ZAY_BODY]))[0], -center(bbox_of([ZAY_BODY]))[1])
    dot_x, dot_y = dot_t.transformPoint((dcx, dcy))
    dot_r = (ZAY_DOT["bbox"][2] - ZAY_DOT["bbox"][0]) / 2 * zay_scale * 1.5

    return {
        "transforms": transforms,
        "stroke": stroke,
        "shaft": {"x0": -overhang, "x1": total + overhang, "y": 30.0, "t": shaft_t},
        "dot": {"cx": dot_x, "cy": dot_y, "ro": dot_r, "ri": dot_r * 0.44},
        "total": total,
    }


def geometry(scale=0.1, **kw):
    """The composed mark scaled and flipped to SVG y-down, origin at top-left.

    Everything is baked into absolute coordinates — the letters path is also
    consumed as a Path2D on the share-card canvas, where a wrapping transform
    would be one more thing to keep in sync.
    """
    m = compose(**kw)

    # Bounds in font units.
    xs, ys = [], []
    for key, cs in (("waw", WAW), ("zay", [ZAY_BODY]), ("nun", NUN)):
        b = bbox_of(cs)
        t = m["transforms"][key]
        for corner in ((b[0], b[1]), (b[2], b[3]), (b[0], b[3]), (b[2], b[1])):
            px, py = t.transformPoint(corner)
            xs.append(px)
            ys.append(py)
    pad = 60 + m["stroke"]
    sh = m["shaft"]
    xs.extend([sh["x0"] - sh["t"] / 2, sh["x1"] + sh["t"] / 2])
    ys.extend([sh["y"] - sh["t"] / 2, sh["y"] + sh["t"] / 2])
    d = m["dot"]
    ys.append(d["cy"] + d["ro"])
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad

    # Font units (y-up) -> mark space (y-down, origin top-left).
    world = Transform().scale(scale, -scale).translate(-x0, -y1)

    pen = SVGPathPen(gs, ntos=lambda v: str(round(v, 2)))
    for key, cs in (("waw", WAW), ("zay", [ZAY_BODY]), ("nun", NUN)):
        draw_t = world.transform(m["transforms"][key])
        tp = TransformPen(pen, draw_t)
        for c in cs:
            for op, args in c["ops"]:
                getattr(tp, op)(*args)

    sx0, sy = world.transformPoint((sh["x0"], sh["y"]))
    sx1, _ = world.transformPoint((sh["x1"], sh["y"]))
    dcx, dcy = world.transformPoint((d["cx"], d["cy"]))

    return {
        "viewW": (x1 - x0) * scale,
        "viewH": (y1 - y0) * scale,
        "letters": pen.getCommands(),
        "letterStroke": m["stroke"] * scale,
        "shaft": {"x0": sx0, "x1": sx1, "y": sy, "t": sh["t"] * scale},
        "dot": {"cx": dcx, "cy": dcy, "ro": d["ro"] * scale, "ri": d["ri"] * scale},
    }


def annulus(dot):
    """A plate face: two circles, even-odd, so the ground shows through."""
    c, r, ri = dot, dot["ro"], dot["ri"]
    return (
        f"M {c['cx'] - r:.2f} {c['cy']:.2f} "
        f"a {r:.2f} {r:.2f} 0 1 0 {2 * r:.2f} 0 a {r:.2f} {r:.2f} 0 1 0 {-2 * r:.2f} 0 Z "
        f"M {c['cx'] - ri:.2f} {c['cy']:.2f} "
        f"a {ri:.2f} {ri:.2f} 0 1 0 {2 * ri:.2f} 0 a {ri:.2f} {ri:.2f} 0 1 0 {-2 * ri:.2f} 0 Z"
    )


def mark_svg(g, letters_color, width=None):
    """The mark as SVG markup (no outer size — the caller wraps it)."""
    sh = g["shaft"]
    return (
        f'<line x1="{sh["x0"]:.2f}" y1="{sh["y"]:.2f}" x2="{sh["x1"]:.2f}" '
        f'y2="{sh["y"]:.2f}" stroke="{ACCENT}" stroke-width="{sh["t"]:.2f}" '
        f'stroke-linecap="round"/>'
        f'<path d="{g["letters"]}" fill="{letters_color}" stroke="{letters_color}" '
        f'stroke-width="{g["letterStroke"]:.2f}" stroke-linejoin="round"/>'
        f'<path d="{annulus(g["dot"])}" fill="{ACCENT}" fill-rule="evenodd"/>'
    )


# ── The Plate ────────────────────────────────────────────────────────────────
#
# The v3 identity. Geometry is transcribed from the brand sheet
# (docs/design/v3-plate/Wazn Brand - Logo.dc.html) and re-emitted parametrically
# here rather than string-copied, so it can be scaled and composed.

# The mark: a gripped plate on a 96 grid. Ring, hole, two grip slots.
MARK_RING = (48.0, 48.0, 44.0)  # cx, cy, r
MARK_HOLE = (48.0, 48.0, 15.0)
MARK_GRIPS = ((12.0, 43.0, 16.0, 10.0, 5.0), (68.0, 43.0, 16.0, 10.0, 5.0))
# Ink bounds of that mark, used to size it inside a tile.
MARK_INK = (12.0, 4.0, 84.0, 92.0)  # x0, y0, x1, y1

# The wordmark's plate — the "a" — on a 100 grid: a bigger hole than the mark's
# and a bar stub instead of grips, because in the word it is being held up.
WM_RING = (46.0, 50.0, 46.0)
WM_HOLE = (46.0, 46.0, 16.0)
WM_BAR = (86.0, 4.0, 14.0, 92.0, 7.0)  # x, y, w, h, r


def circle_d(cx, cy, r):
    """A circle as two arcs — the form the brand sheet writes them in."""
    return (
        f"M{cx - r:.2f} {cy:.2f} "
        f"a{r:.2f} {r:.2f} 0 1 0 {2 * r:.2f} 0 "
        f"a{r:.2f} {r:.2f} 0 1 0 {-2 * r:.2f} 0 Z"
    )


def rrect_d(x, y, w, h, r):
    """A rounded rectangle: the bar stub and the grip slots.

    Both of those are stadiums — h == 2r for the grips, w == 2r for the bar —
    so the straight run on one axis is zero-length. Emitting `h0` anyway is
    valid SVG but reads as a mistake in a committed artifact, so the flat
    sides are dropped when they have no length."""
    fx, fy = w - 2 * r, h - 2 * r
    arc = f"a{r:.2f} {r:.2f} 0 0 1"
    seg = [f"M{x + r:.2f} {y:.2f}"]
    if fx:
        seg.append(f"h{fx:.2f}")
    seg.append(f"{arc} {r:.2f} {r:.2f}")
    if fy:
        seg.append(f"v{fy:.2f}")
    seg.append(f"{arc} {-r:.2f} {r:.2f}")
    if fx:
        seg.append(f"h{-fx:.2f}")
    seg.append(f"{arc} {-r:.2f} {-r:.2f}")
    if fy:
        seg.append(f"v{-fy:.2f}")
    seg.append(f"{arc} {r:.2f} {-r:.2f} Z")
    return " ".join(seg)


def plate_mark_d(s=1.0, ox=0.0, oy=0.0):
    """The gripped plate, even-odd, optionally scaled and moved."""

    def p(v):
        return v * s

    cx, cy, r = MARK_RING
    hx, hy, hr = MARK_HOLE
    parts = [
        circle_d(ox + p(cx), oy + p(cy), p(r)),
        circle_d(ox + p(hx), oy + p(hy), p(hr)),
    ]
    parts += [
        rrect_d(ox + p(gx), oy + p(gy), p(gw), p(gh), p(gr))
        for gx, gy, gw, gh, gr in MARK_GRIPS
    ]
    return " ".join(parts)


def app_icon(size=512, ink_ratio=0.526, ground=ACCENT, glyph=BONE):
    """Home screen, favicon, PWA manifest: the Plate on a vermilion tile.

    Through v2 this was the وزن barbell on ink. The redesign makes the plate
    the mark — it survives being 48px on a home screen in a way a three-letter
    barbell never did, and it needs no reading.

    `ink_ratio` is the fraction of the tile height the drawn plate spans.
    0.526 is the brand sheet's own figure — its icon tiles are 150px with an
    86px svg whose plate fills 91.7% of that.

    One tile now serves both manifest purposes. v2 needed a separate, inset
    maskable icon because a circular crop cut the sleeves off a full-width
    barbell; a centred plate at 52.6% sits well inside the 80% safe circle,
    so "any maskable" on a single file is the honest declaration."""
    vb = 120.0
    x0, y0, x1, y1 = MARK_INK
    scale = (vb * ink_ratio) / (y1 - y0)
    ox = (vb - (x1 + x0) * scale) / 2
    oy = (vb - (y1 + y0) * scale) / 2
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb:.0f} {vb:.0f}" width="{size}" height="{size}" role="img" aria-label="Wazn">
  <title>Wazn</title>
  <rect width="{vb:.0f}" height="{vb:.0f}" fill="{ground}"/>
  <path fill="{glyph}" fill-rule="evenodd" d="{plate_mark_d(scale, ox, oy)}"/>
</svg>
"""


def paths_module():
    """src/components/wordmark-paths.ts — consumed by Wordmark.tsx and the
    share card, so the app and the shared image draw the same object."""
    g = geometry()
    sh, d = g["shaft"], g["dot"]
    return f"""// GENERATED by scripts/build_logo.py — do not edit by hand.
// The Wazn mark: وزن composed as a barbell. Letters take the caller's
// colour; the shaft and the ز plate face are always accent (the iron).

export const MARK_W = {g["viewW"]:.2f}
export const MARK_H = {g["viewH"]:.2f}

/** The three letterforms, fill AND stroke with the letter colour. */
export const LETTERS_D =
  '{g["letters"]}'

export const LETTER_STROKE = {g["letterStroke"]:.2f}

/** The shaft: a round-capped line behind the letters. */
export const SHAFT = {{
  x0: {sh["x0"]:.2f},
  x1: {sh["x1"]:.2f},
  y: {sh["y"]:.2f},
  t: {sh["t"]:.2f},
}}

/** The ز dot as a plate face: even-odd annulus. */
export const DOT_D =
  '{annulus(d)}'
"""


OUT = Path(__file__).parent.parent / "public"
SRC = Path(__file__).parent.parent / "src" / "components"

# ── The Latin wordmark: w · plate · zn ───────────────────────────────────────
#
# Set in Sora 800 with the plate standing in for the "a". The brand sheet's
# hero builds it out of live text in a flex row; this reproduces that layout
# exactly and then freezes the letters as outlines, for the same reason the
# Arabic mark is outlined: `font-display: swap` means live text renders in a
# fallback on first paint, and a wordmark that changes shape while you look at
# it is not a wordmark.
#
# The source is the app's OWN subset (public/fonts/sora-latin.woff2), not a
# fresh download — the letters in the mark are then provably the letters in
# the UI, and this step needs no network.

SORA = Path(__file__).parent.parent / "public" / "fonts" / "sora-latin.woff2"

# Every number below is read off the brand sheet's hero rule:
#   font: 800 128px/1 Sora; letter-spacing: -.05em
#   display:flex; align-items:center; gap:6px
#   svg: width/height 67; margin:0 2px; position:relative; top:16px
WM_SIZE = 128.0
WM_TRACK = -0.05 * WM_SIZE
WM_PLATE_BOX = 67.0
WM_GAP = 6.0
WM_MARGIN = 2.0
WM_DROP = 16.0


def _sora_800():
    from fontTools.varLib.instancer import instantiateVariableFont

    f = TTFont(SORA)
    if "fvar" in f:
        f = instantiateVariableFont(f, {"wght": 800}, inplace=True)
    return f


def latin_lockup():
    """Compose the wordmark into one coordinate space and return its parts."""
    f = _sora_800()
    upem = f["head"].unitsPerEm
    os2, hmtx, gset, cm = f["OS/2"], f["hmtx"], f.getGlyphSet(), f.getBestCmap()
    k = WM_SIZE / upem

    # Where the baseline falls inside a `line-height: 1` box. Half-leading is
    # negative here — Sora's ascent+descent (1.26em) overflows a 1em line box —
    # which is exactly why the plate needs its 16px nudge to look centred.
    asc, desc = os2.sTypoAscender * k, -os2.sTypoDescender * k
    baseline = (WM_SIZE - (asc + desc)) / 2 + asc

    def adv(ch):
        return hmtx[cm[ord(ch)]][0] * k

    # Horizontal cursor. CSS letter-spacing adds its (negative) space AFTER
    # every character, including the last of a span — so the trailing track
    # pulls the plate back toward the "w".
    x_w = 0.0
    x_plate = x_w + adv("w") + WM_TRACK + WM_GAP + WM_MARGIN
    x_zn = x_plate + WM_PLATE_BOX + WM_MARGIN + WM_GAP
    x_n = x_zn + adv("z") + WM_TRACK
    plate_top = (WM_SIZE - WM_PLATE_BOX) / 2 + WM_DROP
    ps = WM_PLATE_BOX / 100.0  # the plate is drawn on a 100 grid

    letters, boxes = [], []
    for ch, x in (("w", x_w), ("z", x_zn), ("n", x_n)):
        # y flips: font units are y-up, SVG is y-down off the baseline.
        place = Transform(k, 0, 0, -k, x, baseline)
        pen = SVGPathPen(gset, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gset[cm[ord(ch)]].draw(TransformPen(pen, place))
        letters.append(pen.getCommands())
        # BoundsPen, not the recording pen's control points: quadratic
        # off-curve points sit outside the ink, and trimming to them would
        # leave the mark floating inside its own viewBox.
        bounds = BoundsPen(gset)
        gset[cm[ord(ch)]].draw(TransformPen(bounds, place))
        boxes.append(bounds.bounds)

    cx, cy, r = WM_RING
    hx, hy, hr = WM_HOLE
    bx, by, bw, bh, br = WM_BAR
    plate = " ".join(
        (
            circle_d(x_plate + cx * ps, plate_top + cy * ps, r * ps),
            circle_d(x_plate + hx * ps, plate_top + hy * ps, hr * ps),
        )
    )
    bar = rrect_d(
        x_plate + bx * ps, plate_top + by * ps, bw * ps, bh * ps, br * ps
    )
    boxes.append(
        (
            x_plate + (cx - r) * ps,
            plate_top + (cy - r) * ps,
            x_plate + (bx + bw) * ps,
            plate_top + (cy + r) * ps,
        )
    )

    # Trim to the drawn ink, so `height` on the component means the height of
    # the mark you can see rather than of a box with slack in it. The paths
    # keep their composed coordinates and the viewBox moves to meet them —
    # viewBox takes a min-x and min-y, so no transform is needed anywhere.
    return {
        "x": min(b[0] for b in boxes),
        "y": min(b[1] for b in boxes),
        "w": max(b[2] for b in boxes) - min(b[0] for b in boxes),
        "h": max(b[3] for b in boxes) - min(b[1] for b in boxes),
        "letters": " ".join(letters),
        "plate": plate,
        "bar": bar,
        "baseline": baseline,
    }


def latin_module():
    """src/components/wordmark-latin-paths.ts — the EN lockup, one viewBox."""
    g = latin_lockup()
    return f"""// GENERATED by scripts/build_logo.py — do not edit by hand.
//
// The Latin wordmark: `w`, a vermilion plate standing in for the `a`, `zn`.
// Sora 800 outlines, composed to the brand sheet's own metrics and trimmed to
// the ink, so `height` on <Wordmark> is the height of what you see.
//
// The letters take the caller's colour; the plate and its bar are always
// accent. Both plate parts are one visual object — the ring needs `evenodd`
// so the ground shows through the hole, the bar must NOT be in that path or
// the even-odd rule would punch it back out again.

/**
 * The composed lockup's ink bounds. The paths keep the coordinates they were
 * composed in and the viewBox moves to meet them, so nothing needs a
 * transform — but the share card draws these on a canvas, which has no
 * viewBox, so it needs the origin as numbers.
 */
export const LATIN_X = {g["x"]:.2f}
export const LATIN_Y = {g["y"]:.2f}
export const LATIN_W = {g["w"]:.2f}
export const LATIN_H = {g["h"]:.2f}

/** The same four numbers as an SVG `viewBox`. */
export const LATIN_VIEWBOX = `${{LATIN_X}} ${{LATIN_Y}} ${{LATIN_W}} ${{LATIN_H}}`

/** `w` and `zn`, already kerned and tracked. Fill with the letter colour. */
export const LATIN_LETTERS_D =
  '{g["letters"]}'

/** The plate that replaces the `a`: ring and hole, needs `fill-rule=evenodd`. */
export const LATIN_PLATE_D =
  '{g["plate"]}'

/** The bar stub the plate is loaded onto. Solid — no even-odd. */
export const LATIN_BAR_D =
  '{g["bar"]}'
"""


def _render():
    """Rasterise the PNG icons through the repo's sharp."""
    root = Path(__file__).parent.parent
    jobs = [
        ("icon-any.svg", "icon-192.png", 192),
        ("icon-any.svg", "icon-512.png", 512),
    ]
    script = ";".join(
        f"sharp(fs.readFileSync('{OUT / a}')).resize({s},{s}).png()"
        f".toFile('{OUT / b}')"
        for a, b, s in jobs
    )
    subprocess.run(
        ["node", "-e", f"const sharp=require('sharp'),fs=require('fs');{script}"],
        cwd=root, check=True,
    )
    for a in {j[0] for j in jobs}:
        (OUT / a).unlink(missing_ok=True)


if __name__ == "__main__":
    (OUT / "icon.svg").write_text(app_icon())
    (OUT / "icon-any.svg").write_text(app_icon())
    _render()
    (SRC / "wordmark-paths.ts").write_text(paths_module())
    (SRC / "wordmark-latin-paths.ts").write_text(latin_module())
    print("wrote public icons, wordmark-paths.ts and wordmark-latin-paths.ts")
