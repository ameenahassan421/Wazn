#!/usr/bin/env node
/**
 * Validate `vercel.json` before Vercel does.
 *
 * On 2026-08-05 a rewrite shipped carrying a `"//"` key holding a comment.
 * Vercel validates `vercel.json` against a strict schema that forbids
 * additional properties and rejected every deployment from that commit onward
 * — main included. CI was fully green throughout, because `npm run build`,
 * lint, typecheck and the tests never read this file. The site did not go
 * down; a rejected deploy leaves the previous one serving, so production
 * simply froze while looking healthy.
 *
 * That is the same shape as migration 0007: a file only the platform parses,
 * shipped on the strength of checks that never look at it. `check_migrations.py`
 * closed that gap for SQL. This closes it for platform config.
 *
 * **Why not fetch the published schema and validate against it.** That is more
 * thorough and it was the first instinct, but it makes every CI run depend on
 * a third-party HTTP request, and a check that fails when a network hiccups
 * teaches people to re-run it rather than read it. The rules below need no
 * network and no dependencies, and they catch the class of mistake that
 * actually happens here: keys that are not real, and rule order that is wrong.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json')

/**
 * Keys Vercel accepts inside each routing rule. Deliberately scoped to the
 * arrays rather than to the whole file: top-level keys are numerous and grow
 * with the platform, and a check that fails when someone adds a legitimate new
 * one is a check people delete.
 */
const ALLOWED = {
  rewrites: ['source', 'destination', 'has', 'missing'],
  redirects: ['source', 'destination', 'permanent', 'statusCode', 'has', 'missing'],
  headers: ['source', 'headers', 'has', 'missing'],
}

/** The SPA catch-all: any path with no dot in it. */
const CATCH_ALL = '/((?!assets/|.*\\..*).*)'

const problems = []

let raw
try {
  raw = readFileSync(CONFIG, 'utf8')
} catch {
  console.log('no vercel.json — nothing to check')
  process.exit(0)
}

let config
try {
  config = JSON.parse(raw)
} catch (error) {
  problems.push(`vercel.json is not valid JSON: ${error.message}`)
}

if (config) {
  // 1. Comment-style keys, anywhere at any depth. JSON has no comments, and
  //    `"//"` is the convention people reach for when they want one. Vercel
  //    rejects it, so catching it by shape is worth more than catching it by
  //    position — the next one will be in `headers`, not `rewrites`.
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (!node || typeof node !== 'object') return
    for (const key of Object.keys(node)) {
      if (key.startsWith('//') || key.startsWith('#') || key === '_comment') {
        problems.push(
          `${path}.${JSON.stringify(key)} is a comment, and vercel.json cannot carry one. ` +
            `Vercel rejects unknown properties outright. Put the reasoning in DECISIONS.md.`,
        )
      }
      walk(node[key], `${path}.${key}`)
    }
  }
  walk(config, 'vercel.json')

  // 2. Unknown keys inside routing rules.
  for (const [section, allowed] of Object.entries(ALLOWED)) {
    const rules = config[section]
    if (!Array.isArray(rules)) continue
    rules.forEach((rule, i) => {
      if (!rule || typeof rule !== 'object') {
        problems.push(`${section}[${i}] is not an object`)
        return
      }
      for (const key of Object.keys(rule)) {
        if (!allowed.includes(key) && !key.startsWith('//')) {
          problems.push(
            `${section}[${i}] has unknown property ${JSON.stringify(key)}. ` +
              `Allowed: ${allowed.join(', ')}.`,
          )
        }
      }
      if (section !== 'headers' && !rule.destination) {
        problems.push(`${section}[${i}] is missing "destination"`)
      }
      if (!rule.source) problems.push(`${section}[${i}] is missing "source"`)
    })
  }

  // 3. Rule order. Rewrites are evaluated top to bottom and the SPA catch-all
  //    matches every path without a dot in it — including `/privacy`. A
  //    specific rule placed after it never fires, and the symptom is a real
  //    page quietly rendering the Log screen. Stage 4B needs /privacy to
  //    resolve, and App Review checks that URL.
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : []
  const catchAll = rewrites.findIndex((rule) => rule?.source === CATCH_ALL)
  if (catchAll !== -1 && catchAll !== rewrites.length - 1) {
    const stranded = rewrites
      .slice(catchAll + 1)
      .map((rule) => rule?.source)
      .join(', ')
    problems.push(
      `the SPA catch-all is not last, so these rewrites can never fire: ${stranded}. ` +
        `Vercel evaluates rewrites in order and the catch-all matches any dotless path.`,
    )
  }
}

if (problems.length > 0) {
  console.error('vercel.json would be rejected:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nhttps://vercel.com/docs/projects/project-configuration')
  process.exit(1)
}

console.log('vercel.json looks deployable')
