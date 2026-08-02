"""Generate the Wazn logo assets: public/icon.svg and the PWA icon PNGs.

    python3 scripts/build_logo.py

Downloads Aref Ruqaa from Google Fonts, converts وزن to outlines, and lays
out the mark. Run it only when the mark itself changes — the outputs are
committed, and nothing at runtime depends on the font.

Requires `fontsTools` and the repo's `sharp` for rasterising:
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
from fontTools.pens.boundsPen import BoundsPen
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


FONT = font_path()
WORD = "وزن"  # و ز ن in logical order

font = TTFont(FONT)
upem = font["head"].unitsPerEm
cmap = font.getBestCmap()
gs = font.getGlyphSet()
hmtx = font["hmtx"]

names = []
for ch in WORD:
    gid = cmap.get(ord(ch))
    if gid is None:
        sys.exit(f"no glyph for U+{ord(ch):04X}")
    names.append(gid)

advances = [hmtx[n][0] for n in names]
total = sum(advances)

# Right-to-left: the first logical character sits at the right edge.
placements = []
x = total
for name, adv in zip(names, advances):
    x -= adv
    placements.append((name, x))

# Measure the real ink box so the mark can be centred on its ink, not on
# its advance box — Ruqaa's side bearings are generous and asymmetric.
bp = BoundsPen(gs)
for name, xoff in placements:
    gs[name].draw(TransformPen(bp, Transform().translate(xoff, 0)))

xmin, ymin, xmax, ymax = bp.bounds


def path_at(font_size, cx, baseline, decimals=2):
    """Path data for the word at font_size, ink-centred on cx, sitting on baseline."""
    scale = font_size / upem
    ink_cx = (xmin + xmax) / 2 * scale
    pen = SVGPathPen(gs, ntos=lambda v: str(round(v, decimals)))
    # y flips: font space is y-up, SVG is y-down.
    base = Transform().translate(cx - ink_cx, baseline).scale(scale, -scale)
    for name, xoff in placements:
        gs[name].draw(TransformPen(pen, base.translate(xoff, 0)))
    return pen.getCommands()


def metrics(font_size):
    scale = font_size / upem
    return {
        "width": (xmax - xmin) * scale,
        "above": ymax * scale,   # height above the baseline
        "below": -ymin * scale,  # depth below the baseline
    }


OUT = Path(__file__).parent.parent / "public"
OUT.mkdir(exist_ok=True)

INK = "#0c0b0a"
TEXT = "#ecebe8"
ACCENT = "#f0b429"
DIVIDER = "rgba(236,235,232,0.16)"

# Plates, innermost first. (thickness, height), as multiples of H.
PLATES = [(0.307, 1.90), (0.266, 1.57), (0.225, 1.25), (0.184, 0.92)]
PLATE_GAP = 0.082   # between plates
WORD_GAP = 0.634    # word ink to innermost plate
OVERHANG = 0.777    # bar past the outermost plate
BAR_T = 0.143       # bar thickness


def loaded_bar(font_size, cx, baseline, plates=4, color=ACCENT, overhang=OVERHANG):
    """The iron: bar plus a mirrored plate stack, sized off the word."""
    m = metrics(font_size)
    h = m["above"]
    mid = baseline - h * 0.42  # the bar crosses the word, not its baseline

    rects = []
    edge = m["width"] / 2 + WORD_GAP * h  # inner edge of the innermost plate
    for thick, tall in PLATES[:plates]:
        t, ht = thick * h, tall * h
        for x in (cx + edge, cx - edge - t):
            rects.append(
                f'<rect x="{x:.2f}" y="{mid - ht / 2:.2f}" width="{t:.2f}" '
                f'height="{ht:.2f}" rx="{min(t / 2, 4.5):.2f}"/>'
            )
        edge += t + PLATE_GAP * h

    half = edge - PLATE_GAP * h + overhang * h
    bar_t = BAR_T * h
    bar = (
        f'<rect x="{cx - half:.2f}" y="{mid - bar_t / 2:.2f}" '
        f'width="{2 * half:.2f}" height="{bar_t:.2f}" rx="{bar_t / 2:.2f}"/>'
    )
    # Bar after the plates and after the word: the iron sits in front.
    return f'<g fill="{color}">{bar}{"".join(rects)}</g>', half, mid


def primary():
    """Stacked lockup: word on the bar, hairline, WAZN. Splash and share card."""
    fs = 88
    m = metrics(fs)
    cx = 200.0
    baseline = 92.0
    iron, half, mid = loaded_bar(fs, cx, baseline)
    top = mid - PLATES[0][1] * m["above"] / 2
    # Clear the tallest plate before the hairline, or the rule reads as part
    # of the plate stack.
    rule_y = mid + PLATES[0][1] * m["above"] / 2 + 22
    latin_y = rule_y + 32
    h = latin_y + 10
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top - 14:.0f} 400 {h - top + 14:.0f}" role="img" aria-label="Wazn">
  <title>Wazn</title>
  <path d="{path_at(fs, cx, baseline)}" fill="{TEXT}"/>
  {iron}
  <rect x="{cx - half * 0.53:.1f}" y="{rule_y:.0f}" width="{half * 1.06:.1f}" height="1" fill="{DIVIDER}"/>
  <text x="{cx:.0f}" y="{latin_y:.0f}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="600" letter-spacing="9" fill="{TEXT}">WAZN</text>
</svg>
"""


def nav_mark():
    """In-app header mark. Three plates a side — at 34px tall the fourth
    closes the gap between plates and reads as a solid block."""
    fs = 64
    m = metrics(fs)
    cx = 100.0
    baseline = 64.0
    iron, half, mid = loaded_bar(fs, cx, baseline, plates=3, color=ACCENT)
    top = mid - PLATES[0][1] * m["above"] / 2
    bot = mid + PLATES[0][1] * m["above"] / 2
    pad = 3
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cx - half - pad:.1f} {top - pad:.1f} {2 * (half + pad):.1f} {bot - top + 2 * pad:.1f}" role="img" aria-label="Wazn">
  <title>Wazn</title>
  <path d="{path_at(fs, cx, baseline)}" fill="currentColor"/>
  {iron}
</svg>
"""


def app_icon(size=512, pad_ratio=0.78):
    """Home screen, favicon, PWA manifest. Word + bar only, no Latin.

    Two plates a side and a short overhang: a four-plate bar is a wide,
    shallow mark, and inside a square tile it shrinks to a thin strip. The
    compact load fills the square and stays legible at 24px.

    The mark occupies pad_ratio of the tile so it survives a maskable crop,
    which can take up to 20% off each edge."""
    fs = 58
    m = metrics(fs)
    vb = 120.0
    cx = vb / 2
    iron, half, mid = loaded_bar(fs, cx, 70.0, plates=2, overhang=0.34)
    scale = (vb * pad_ratio) / (2 * half)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb:.0f} {vb:.0f}" width="{size}" height="{size}" role="img" aria-label="Wazn">
  <title>Wazn</title>
  <rect width="{vb:.0f}" height="{vb:.0f}" fill="{INK}"/>
  <g transform="translate({cx:.1f} {cx:.1f}) scale({scale:.4f}) translate({-cx:.1f} {-mid:.1f})">
    <path d="{path_at(fs, cx, 70.0)}" fill="{TEXT}"/>
    {iron}
  </g>
</svg>
"""


def _inner(svg):
    return svg.split(">", 1)[1].rsplit("</svg>", 1)[0]


def preview():
    p, n, i = primary(), nav_mark(), app_icon()
    pv = p.split('viewBox="')[1].split('"')[0]
    nv = n.split('viewBox="')[1].split('"')[0]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440" width="880" height="880">
  <rect width="440" height="440" fill="{INK}"/>
  <g transform="translate(20,16)"><svg width="400" height="190" viewBox="{pv}">{_inner(p)}</svg></g>
  <g transform="translate(20,230)" color="{TEXT}"><svg width="150" height="52" viewBox="{nv}">{_inner(n)}</svg></g>
  <g transform="translate(20,310)" color="{TEXT}"><svg width="98" height="34" viewBox="{nv}">{_inner(n)}</svg></g>
  <g transform="translate(230,225)"><svg width="96" height="96" viewBox="0 0 120 120">{_inner(i)}</svg></g>
  <g transform="translate(345,225)"><svg width="48" height="48" viewBox="0 0 120 120">{_inner(i)}</svg></g>
  <g transform="translate(345,290)"><svg width="24" height="24" viewBox="0 0 120 120">{_inner(i)}</svg></g>
  <g transform="translate(20,370)" color="{TEXT}"><svg width="53" height="18" viewBox="{nv}">{_inner(n)}</svg></g>
</svg>
"""



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
    for a, _, _ in {(j[0], 0, 0) for j in jobs}:
        (OUT / a).unlink(missing_ok=True)


if __name__ == "__main__":
    (OUT / "icon.svg").write_text(app_icon(pad_ratio=0.86))
    (OUT / "icon-any.svg").write_text(app_icon(pad_ratio=0.86))
    (OUT / "icon-maskable.svg").write_text(app_icon(pad_ratio=0.62))
    _render()
    print("wrote public/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png")
    print()
    print("Nav mark for src/components/Wordmark.tsx:")
    print(nav_mark())
