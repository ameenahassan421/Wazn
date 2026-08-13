/**
 * STEP 2 of F2: Render the SEO pages into `dist/` from the committed snapshot.
 *
 *   node scripts/build_seo_pages.mjs     (wired as `postbuild`)
 *
 * Hermetic: reads only `build/seo/exercises.json`. No network, no credentials.
 * If the snapshot is missing this exits 0 with a loud warning so `npm run build`
 * stays green until STEP 1 has been run on a machine with the token.
 *
 * Outputs (all under `dist/`):
 *   /exercises/<slug>.html          English exercise page
 *   /ar/exercises/<slug>.html       Arabic exercise page (dir="rtl")
 *   /exercises.html                 English index, grouped by muscle group
 *   /ar/exercises.html              Arabic index, grouped by muscle group
 *   /sitemap.xml                    every generated HTML URL
 *   /robots.txt                     points at the sitemap
 *
 * Every exercise page is self-contained: inline CSS, no JS bundle, no
 * framework. Logical CSS properties only; dark theme with one amber accent
 * (#e8491d); no gradients, no emoji, no em-dashes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_SITE_URL = 'https://workout-theta-plum.vercel.app'

const MUSCLE_ORDER = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
]

// ---------------------------------------------------------------------------
// Small helpers (the .mjs cannot import the .ts slug module)
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function truncate(text, max) {
  if (text.length <= max) return text
  return text.slice(0, max - 3).trimEnd() + '...'
}

/**
 * Where the FILE goes on disk. Keeps `.html`.
 */
function exercisePath(slug, locale) {
  return locale === 'en' ? `/exercises/${slug}.html` : `/ar/exercises/${slug}.html`
}

/**
 * The PUBLIC url, which is extensionless because vercel.json rewrites
 * `/exercises/<slug>` to the file. These must not be the same string: a
 * canonical pointing at the `.html` while the clean url also serves the page
 * gives every page two addresses and points the canonical at the uglier one,
 * which is the opposite of what a canonical is for. Sitemap and hreflang use
 * this too, so all three agree.
 */
function exerciseUrlPath(slug, locale) {
  return locale === 'en' ? `/exercises/${slug}` : `/ar/exercises/${slug}`
}

function exerciseUrl(slug, locale, siteUrl) {
  return `${siteUrl}${exerciseUrlPath(slug, locale)}`
}

// ---------------------------------------------------------------------------
// Shared page shell
// ---------------------------------------------------------------------------

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: #0e1116;
  color: #e8e6e3;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
}
a { color: #e8491d; text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 640px; margin-inline: auto; padding: 2rem 1.25rem 3rem; }
header { border-block-end: 1px solid #1f242c; }
.site-title { font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; }
h1 { font-size: 1.75rem; line-height: 1.25; margin-block: 0.75rem 0.25rem; }
h2 { font-size: 1.2rem; margin-block: 2rem 0.5rem; color: #e8491d; }
.meta { color: #9ca3af; margin-block: 0 1.5rem; font-size: 0.95rem; }
ol.instructions { padding-inline-start: 1.25rem; }
ol.instructions li { margin-block-end: 0.6rem; }
.lang-switch { display: inline-block; margin-block-start: 2rem; font-size: 0.9rem; }
.group { margin-block-end: 1.75rem; }
.group h2 { margin-block: 0 0.5rem; }
.group ul { list-style: none; padding-inline-start: 0; margin: 0; }
.group li { padding-block: 0.15rem; }
footer { margin-block-start: 3rem; padding-block-start: 1rem; border-block-start: 1px solid #1f242c; color: #9ca3af; font-size: 0.9rem; }
`

function pageShell({
  lang,
  dir,
  title,
  description,
  canonicalUrl,
  hreflang,
  jsonLd,
  body,
  siteUrl,
}) {
  const hreflangTags = hreflang
    .map(
      ({ href, code }) =>
        `  <link rel="alternate" hreflang="${code}" href="${escapeHtml(href)}">`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="${lang}"${dir ? ` dir="${dir}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
${hreflangTags}
  <script type="application/ld+json">${jsonLd}</script>
  <style>${CSS}</style>
</head>
<body>
  <header><div class="container"><a class="site-title" href="${escapeHtml(siteUrl)}">Wazn</a></div></header>
  <main class="container">
${body}
  </main>
  <footer><div class="container"><a href="${escapeHtml(siteUrl)}">Wazn</a> is a mobile-first strength-training app.</div></footer>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Exercise page
// ---------------------------------------------------------------------------

function metaDescription(exercise, locale) {
  if (locale === 'ar') {
    return `تعلم أداء ${exercise.name_ar}. العضلات المستهدفة: ${exercise.muscle_group_ar}. المعدات: ${exercise.equipment_ar}.`
  }
  const first = Array.isArray(exercise.instructions) && exercise.instructions[0]
  if (first) return truncate(first, 155)
  return `How to do a ${exercise.name_en} with proper form. Target muscle: ${exercise.muscle_group}, equipment: ${exercise.equipment}.`
}

function exerciseJsonLd(exercise, locale, siteUrl) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ExerciseAction',
    name: locale === 'ar' ? exercise.name_ar : exercise.name_en,
    description: metaDescription(exercise, locale),
    url: exerciseUrl(exercise.slug, locale, siteUrl),
    inLanguage: locale,
  })
}

export function renderExercisePage(exercise, locale, siteUrl) {
  const enUrl = exerciseUrl(exercise.slug, 'en', siteUrl)
  const arUrl = exerciseUrl(exercise.slug, 'ar', siteUrl)
  const canonicalUrl = locale === 'en' ? enUrl : arUrl

  let body
  if (locale === 'ar') {
    const stepsAr = (exercise.instructions_ar ?? [])
      .map((step) => `    <li>${escapeHtml(step)}</li>`)
      .join('\n')
    body = `
    <h1>${escapeHtml(exercise.name_ar)}</h1>
    <p class="meta">${escapeHtml(exercise.muscle_group_ar)} · ${escapeHtml(exercise.equipment_ar)}</p>
    <h2>طريقة الأداء</h2>
    <ol class="instructions">
${stepsAr}
    </ol>
    <p>${escapeHtml(exercise.name_ar)} من تمارين القوة في دليل وزن، ويستهدف ${escapeHtml(exercise.muscle_group_ar)} باستخدام ${escapeHtml(exercise.equipment_ar)}. افتح التطبيق لتسجيل مجموعة في أقل من 30 ثانية.</p>
    <p><a class="lang-switch" href="${escapeHtml(enUrl)}" hreflang="en">View this exercise in English</a></p>`
  } else {
    const steps =
      Array.isArray(exercise.instructions) && exercise.instructions.length > 0
        ? exercise.instructions
            .map((step) => `    <li>${escapeHtml(step)}</li>`)
            .join('\n')
        : '    <li>Set up with the correct weight and a full range of motion.</li>'
    body = `
    <h1>${escapeHtml(exercise.name_en)}</h1>
    <p class="meta">${escapeHtml(capitalize(exercise.muscle_group))} · ${escapeHtml(capitalize(exercise.equipment))}</p>
    <h2>How to do it</h2>
    <ol class="instructions">
${steps}
    </ol>
    <p><a class="lang-switch" href="${escapeHtml(arUrl)}" hreflang="ar">شاهد هذا التمرين بالعربية</a></p>`
  }

  const hreflang = [
    { code: 'en', href: enUrl },
    { code: 'ar', href: arUrl },
    { code: 'x-default', href: enUrl },
  ]

  return pageShell({
    lang: locale === 'ar' ? 'ar' : 'en',
    dir: locale === 'ar' ? 'rtl' : null,
    title:
      locale === 'ar' ? `${exercise.name_ar} | Wazn` : `${exercise.name_en} | Wazn`,
    description: metaDescription(exercise, locale),
    canonicalUrl,
    hreflang,
    jsonLd: exerciseJsonLd(exercise, locale, siteUrl),
    body,
    siteUrl,
  })
}

// ---------------------------------------------------------------------------
// Index page (grouped by muscle group)
// ---------------------------------------------------------------------------

function indexJsonLd(exercises, locale, siteUrl) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    inLanguage: locale,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: exercises.map((ex, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: locale === 'ar' ? ex.name_ar : ex.name_en,
        url: exerciseUrl(ex.slug, locale, siteUrl),
      })),
    },
  })
}

export function renderIndexPage(exercises, locale, siteUrl) {
  const enUrl = `${siteUrl}/exercises`
  const arUrl = `${siteUrl}/ar/exercises`
  const canonicalUrl = locale === 'en' ? enUrl : arUrl

  const byGroup = new Map()
  for (const ex of exercises) {
    if (!byGroup.has(ex.muscle_group)) byGroup.set(ex.muscle_group, [])
    byGroup.get(ex.muscle_group).push(ex)
  }

  const groups = MUSCLE_ORDER.filter((group) => byGroup.has(group))
    .map((group) => {
      const exercises = byGroup.get(group)
      const label =
        locale === 'ar'
          ? (exercises[0] && exercises[0].muscle_group_ar) || capitalize(group)
          : capitalize(group)
      const items = exercises
        .map((ex) => {
          const name = locale === 'ar' ? ex.name_ar : ex.name_en
          return `      <li><a href="${escapeHtml(exercisePath(ex.slug, locale))}">${escapeHtml(name)}</a></li>`
        })
        .join('\n')
      return `    <section class="group">
      <h2>${escapeHtml(label)}</h2>
      <ul>
${items}
      </ul>
    </section>`
    })
    .join('\n')

  const title =
    locale === 'ar' ? 'تمارين القوة | Wazn' : 'Strength-training exercises | Wazn'
  const description =
    locale === 'ar'
      ? 'كل تمارين القوة في تطبيق وزن، مصنفة حسب العضلة المستهدفة.'
      : 'Every strength-training exercise in the Wazn catalogue, grouped by target muscle.'

  const body = `
    <h1>${locale === 'ar' ? 'تمارين القوة' : 'Strength-training exercises'}</h1>
    <p class="meta">${locale === 'ar' ? `${exercises.length} تمريناً` : `${exercises.length} exercises`}</p>
${groups}
    <p><a class="lang-switch" href="${locale === 'en' ? arUrl : enUrl}" hreflang="${locale === 'en' ? 'ar' : 'en'}">${locale === 'en' ? 'شاهد القائمة بالعربية' : 'View the list in English'}</a></p>`

  return pageShell({
    lang: locale === 'ar' ? 'ar' : 'en',
    dir: locale === 'ar' ? 'rtl' : null,
    title,
    description,
    canonicalUrl,
    hreflang: [
      { code: 'en', href: enUrl },
      { code: 'ar', href: arUrl },
      { code: 'x-default', href: enUrl },
    ],
    jsonLd: indexJsonLd(exercises, locale, siteUrl),
    body,
    siteUrl,
  })
}

// ---------------------------------------------------------------------------
// Sitemap + robots
// ---------------------------------------------------------------------------

export function renderSitemap(exercises, siteUrl) {
  const urls = [`${siteUrl}/exercises`, `${siteUrl}/ar/exercises`]
  for (const ex of exercises) {
    urls.push(exerciseUrl(ex.slug, 'en', siteUrl))
    urls.push(exerciseUrl(ex.slug, 'ar', siteUrl))
  }
  const locs = urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs}
</urlset>
`
}

export function renderRobots(siteUrl) {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`
}

// ---------------------------------------------------------------------------
// Full page set (used by main and by tests)
// ---------------------------------------------------------------------------

/**
 * Only exercises that actually have instruction text get a page.
 *
 * free-exercise-db matches about 110 of 134; the rest are machine variants and
 * non-lifts like "Warm Up" and "Stair Machine". A page for one of those would
 * carry a name, a muscle group and nothing else, and a few dozen near-identical
 * stubs is a site-quality liability rather than a ranking opportunity. Skipping
 * them is the whole difference between an SEO asset and thin content.
 */
export function hasArabic(exercise) {
  return Array.isArray(exercise.instructions_ar) && exercise.instructions_ar.length > 0
}

export function withContent(exercises) {
  return exercises.filter(
    (ex) => Array.isArray(ex.instructions) && ex.instructions.length > 0,
  )
}

export function renderPages(allExercises, siteUrl) {
  const exercises = withContent(allExercises)
  const pages = []
  pages.push({
    path: '/exercises.html',
    content: renderIndexPage(exercises, 'en', siteUrl),
  })
  pages.push({
    path: '/ar/exercises.html',
    content: renderIndexPage(exercises.filter(hasArabic), 'ar', siteUrl),
  })
  for (const ex of exercises) {
    pages.push({
      path: exercisePath(ex.slug, 'en'),
      content: renderExercisePage(ex, 'en', siteUrl),
    })
    // No Arabic steps, no Arabic page. A heading and one sentence is the thin
    // page this whole feature is supposed to avoid, and it would be thin in
    // precisely the language F2 exists to win.
    if (hasArabic(ex)) {
      pages.push({
        path: exercisePath(ex.slug, 'ar'),
        content: renderExercisePage(ex, 'ar', siteUrl),
      })
    }
  }
  pages.push({ path: '/sitemap.xml', content: renderSitemap(exercises, siteUrl) })
  pages.push({ path: '/robots.txt', content: renderRobots(siteUrl) })
  return pages
}

// ---------------------------------------------------------------------------
// main(): file I/O
// ---------------------------------------------------------------------------

export function main() {
  const jsonPath = resolve('build/seo/exercises.json')
  if (!existsSync(jsonPath)) {
    console.warn(
      'build_seo_pages: build/seo/exercises.json not found; skipping SEO page ' +
        'generation. Run `npx tsx scripts/build_seo_data.ts` once on a machine ' +
        'with SUPABASE_ACCESS_TOKEN to create it. Build continues.',
    )
    return
  }

  const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const siteUrl = process.env.WAZN_SITE_URL || DEFAULT_SITE_URL
  const dist = resolve('dist')

  const all = data.exercises ?? []
  const pages = renderPages(all, siteUrl)
  const skipped = all.length - withContent(all).length
  for (const { path, content } of pages) {
    const fullPath = join(dist, path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }

  // Say what was dropped. A silent skip reads as "covered everything".
  console.log(
    `build_seo_pages: wrote ${pages.length} files for ` +
      `${withContent(all).length} exercises (${withContent(all).filter(hasArabic).length} with Arabic) to ${dist}` +
      (skipped > 0 ? ` (skipped ${skipped} with no instructions)` : ''),
  )
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main()
}
