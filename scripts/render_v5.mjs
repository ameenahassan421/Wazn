/**
 * Render the v5 reference HTML locally.
 *
 * The bundle loads React, ReactDOM and Babel from unpkg.com, which this
 * environment's egress policy refuses (403 on CONNECT). So the prototype
 * cannot render as shipped, and fidelity rule 3 — "open them in a browser at
 * 430px and measure against them" — is unreachable without this.
 *
 * The bundle itself is NEVER modified: it is normative. A rewritten copy is
 * assembled in a temp dir with node_modules' React UMD builds and the JSX
 * pre-transformed by esbuild (already a vite dependency, so no new install).
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { chromium } from '@playwright/test'

const SRC = 'docs/design/v5-momentum'
const TMP =
  '/tmp/claude-0/-home-user-Wazn/db4ff1f9-a94a-5da4-87e2-73f9a9a7fe90/scratchpad/v5render'
mkdirSync(TMP + '/design', { recursive: true })
cpSync(SRC + '/fonts', TMP + '/fonts', { recursive: true })

// Saira comes from the Google Fonts CDN in the bundle. googleapis.com is
// reachable here but the render was falling back to a generic sans, which
// makes every type measurement a lie — the whole face is condensed. Fetched
// once (see the plan) and injected locally so the reference is type-accurate.
const SAIRA = 'public/fonts'
let sairaCss = ''
for (const w of [500, 600, 700]) {
  copyFileSync(
    `${SAIRA}/saira-semi-condensed-${w}-latin.woff2`,
    `${TMP}/fonts/saira-${w}.woff2`,
  )
  sairaCss += `@font-face{font-family:'Saira Semi Condensed';font-style:normal;font-weight:${w};font-display:block;src:url('./saira-${w}.woff2') format('woff2');}\n`
}
writeFileSync(
  TMP + '/fonts/fonts.css',
  readFileSync(SRC + '/fonts/fonts.css', 'utf8') + '\n' + sairaCss,
)

for (const f of [
  'react/umd/react.development.js',
  'react-dom/umd/react-dom.development.js',
])
  copyFileSync('node_modules/' + f, TMP + '/design/' + f.split('/').pop())

for (const f of ['data.js', 'coach2.js'])
  copyFileSync(`${SRC}/design/${f}`, `${TMP}/design/${f}`)

for (const f of ['ui.jsx', 'screens_core.jsx', 'screens_tabs.jsx']) {
  const out = transformSync(readFileSync(`${SRC}/design/${f}`, 'utf8'), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  })
  writeFileSync(`${TMP}/design/${f.replace('.jsx', '.js')}`, out.code)
}

for (const [file, name] of [
  ['Wazn v5.html', 'app'],
  ['Onboarding.html', 'onboarding'],
]) {
  let html = readFileSync(`${SRC}/design/${file}`, 'utf8')
  html = html
    .replace(
      /<script src="https:\/\/unpkg\.com\/react@[^"]*"[^>]*><\/script>/,
      '<script src="react.development.js"></script>',
    )
    .replace(
      /<script src="https:\/\/unpkg\.com\/react-dom@[^"]*"[^>]*><\/script>/,
      '<script src="react-dom.development.js"></script>',
    )
    .replace(/<script src="https:\/\/unpkg\.com\/@babel[^"]*"[^>]*><\/script>/, '')
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, '')
    .replace(
      /<script type="text\/babel" src="([^"]+)\.jsx"><\/script>/g,
      '<script src="$1.js"></script>',
    )
  // The entry component is an INLINE text/babel block at the end of each file.
  // Transforming only the external .jsx files left React loaded and nothing
  // mounted — a blank ground with no page error, which is exactly what a
  // missing entry point looks like.
  html = html.replace(
    /<script type="text\/babel">([\s\S]*?)<\/script>/g,
    (_m, code) =>
      '<script>' +
      transformSync(code, {
        loader: 'jsx',
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
      }).code +
      '</script>',
  )
  writeFileSync(`${TMP}/design/${file}`, html)
}

const b = await chromium.launch()
for (const [file, name] of [
  ['Wazn v5.html', 'app'],
  ['Onboarding.html', 'onboarding'],
]) {
  const p = await b.newPage({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('file://' + TMP + '/design/' + encodeURIComponent(file), {
    waitUntil: 'networkidle',
  })
  await p.waitForTimeout(2000)
  await p.screenshot({ path: `shots/v5-430-${name}.png`, fullPage: false })
  const txt = (await p.locator('body').innerText()).replace(/\n/g, ' / ').slice(0, 140)
  console.log(`${name}: errors=${errs.length ? errs[0].slice(0, 90) : 'none'} | ${txt}`)
  await p.close()
}
await b.close()
