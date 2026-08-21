# The current design system

`Wazn-Prototype.html` is the reference, supplied by Ameen on 2026-08-20. It is a
self-contained bundle: open it in a browser and it runs. Four screens — Home,
Workout, Rest, Finish — with live state, a rest timer and plate maths.

**It replaces `docs/design/v5-momentum/`.** Ameen's call the same day, after two
rounds of telling a session that the logo and the design were wrong while every
automated check was green.

## Read the source, not a screenshot

`source.html` is the design extracted from the bundle: the `x-dc` template and
the component script, with the 12KB `@font-face` wall stripped. Every size,
colour, radius and shadow in the system is a literal in that file. It was
produced with:

```python
import re, json, pathlib
s = pathlib.Path('Wazn-Prototype.html').read_text()
body = json.loads(re.search(r'<script type="__bundler/template">(.*?)</script>\s*<script>', s, re.S).group(1).strip())
```

The manifest under `<script type="__bundler/manifest">` holds the woff2 faces and
the one JPEG, base64, keyed by uuid.

## What it is

| | |
| --- | --- |
| Ground | paper `#f7f3ec`; the page behind the device is `#e9e4d8` |
| Cards | `#ffffff`, radius 20, a hairline ring **and** a 1px lift |
| Text | `#16130e`; prose `#4f4a41`; labels `#8a8378` |
| Accent | `#e8491d`, pressed `#b83915`, wash `rgba(232,73,29,.09)` |
| Display | **Sora** 600/700/800, tracking `-.01` to `-.05em` |
| Body | Hanken Grotesk 500/600 |
| Mono | IBM Plex Mono 500 |
| Controls | pills. The hero CTA is 58 standing, 60 mid-workout, with an ember glow |
| The mark | the plate glyph used as the letter `a` in `wazn` |

The one dark surface is the **rest canvas**, which inverts the whole screen to
`#16130e` for the length of a rest and back again. That is why the palette has an
`onInk*` family — see `mobile/src/design/Txt.tsx`.

## What it does not cover

Auth, History, Progress, Body, Coach and Friends. Those six have to be DERIVED in
this language rather than copied, and WAZN_PLAN 7.0 says so rather than letting a
session quietly invent them and call it the design.
