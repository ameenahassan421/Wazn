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
    pip install fonttools && npm install
"""

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
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

INK = "#0c0b0a"
TEXT = "#ecebe8"
ACCENT = "#f0b429"


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


def app_icon(size=512, pad_ratio=0.86):
    """Home screen, favicon, PWA manifest: the mark on an ink tile.

    A tighter set than the wordmark — smaller gaps, short overhang — so the
    wide mark fills the square instead of shrinking to a strip. pad_ratio
    0.62 for the maskable variant: the crop can take 20% off each edge."""
    g = geometry(gap=60, overhang=50, stroke=46, zay_scale=0.9)
    vb = 120.0
    scale = (vb * pad_ratio) / g["viewW"]
    ox = (vb - g["viewW"] * scale) / 2
    oy = (vb - g["viewH"] * scale) / 2
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb:.0f} {vb:.0f}" width="{size}" height="{size}" role="img" aria-label="Wazn">
  <title>Wazn</title>
  <rect width="{vb:.0f}" height="{vb:.0f}" fill="{INK}"/>
  <g transform="translate({ox:.2f} {oy:.2f}) scale({scale:.4f})">{mark_svg(g, TEXT)}</g>
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


def _render():
    """Rasterise the PNG icons through the repo's sharp."""
    root = Path(__file__).parent.parent
    jobs = [
        ("icon-any.svg", "icon-192.png", 192),
        ("icon-any.svg", "icon-512.png", 512),
        ("icon-maskable.svg", "icon-maskable-512.png", 512),
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
    (OUT / "icon.svg").write_text(app_icon(pad_ratio=0.86))
    (OUT / "icon-any.svg").write_text(app_icon(pad_ratio=0.86))
    (OUT / "icon-maskable.svg").write_text(app_icon(pad_ratio=0.62))
    _render()
    (SRC / "wordmark-paths.ts").write_text(paths_module())
    print("wrote public icons and src/components/wordmark-paths.ts")
