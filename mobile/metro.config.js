/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path')

const { getDefaultConfig } = require('expo/metro-config')

/**
 * Metro, taught to reach one directory outside its own project.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * The domain logic — Epley, unit conversion, the coach's deterministic rules,
 * the write queue's arithmetic — is the most tested code in this repository
 * and none of it knows what a screen is. Copying it into `mobile/` would fork
 * it: two Epleys, two rounding rules, and a lifter whose phone and browser
 * disagree about their own e1RM. So the native app reads the SAME files the
 * web app does, at `../src/lib`, through the `@wazn/domain` alias below.
 *
 * ── THE TWO SETTINGS THAT MATTER ────────────────────────────────────────────
 * `watchFolders` lets Metro resolve and watch files above `mobile/`.
 * `disableHierarchicalLookup` stops it walking UP into the repo root's
 * `node_modules`, which holds React 18, react-dom and Vite. Without it Metro
 * would happily resolve `react` to the web app's copy and the bundle would
 * fail somewhere far away from the cause.
 *
 * Only `src/lib` is watched, not the repo root: watching the root would pull
 * 550 MB of the web app's `node_modules` into the file watcher for nothing.
 */
const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')
const domainRoot = path.resolve(repoRoot, 'src/lib')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [domainRoot]

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]
config.resolver.disableHierarchicalLookup = true
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@wazn/domain': domainRoot,
}

/* Plain Metro. `withNativeWind(config, { input: './global.css' })` wrapped
   this until 2026-08-20 — see `babel.config.js` for why it went. */
module.exports = config
