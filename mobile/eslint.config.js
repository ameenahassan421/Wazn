/* eslint-disable @typescript-eslint/no-require-imports */
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

/**
 * The Expo app's own lint.
 *
 * ── WHY IT IS SEPARATE FROM THE WEB CONFIG ──────────────────────────────────
 * The root `eslint.config.js` enforces rules that are about CSS — no `ml-`,
 * no `text-left`, logical properties only — and knows nothing about React
 * Native. Run over this directory it would flag every style object and catch
 * none of the things that actually break a native build. So the root config
 * ignores `mobile/` and this one owns it.
 *
 * ── WHY IT EXISTS AT ALL ────────────────────────────────────────────────────
 * The first version of the mobile CI job ran `tsc` and `expo export` and no
 * linter, and an unused import shipped to `main` inside an hour. `tsc` does
 * not flag unused imports without `noUnusedLocals`, and `expo export` happily
 * bundles dead code. This is the layer that sees it.
 */
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', '.expo-export*/**', 'node_modules/**', 'tailwind.tokens.js'],
  },
  {
    rules: {
      /**
       * The rule that would have caught the shipped defect. `expo lint`'s
       * preset leaves unused variables as a warning, and a warning in CI is a
       * line of output nobody reads.
       */
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /**
       * PHYSICAL PROPERTIES ARE BANNED HERE TOO.
       *
       * The web app's version of this rule is a Tailwind class check; React
       * Native's equivalent is the style key. `marginLeft` and `left` do not
       * flip in an RTL layout and `marginStart` / `start` do, so an Arabic
       * locale would mirror everything except whatever was written with the
       * physical name — which is worse than not mirroring at all, because it
       * looks deliberate.
       *
       * `textAlign: 'left'` is the same failure in a different key and is
       * caught by the second selector.
       */
      'no-restricted-syntax': [
        'error',
        {
          // `ObjectExpression >` is load-bearing. Without it the selector
          // also matches destructuring patterns and caught `{ name, right }`
          // in a component's own props on the first run — a prop called
          // `right` is a slot, not a physical offset.
          selector:
            'ObjectExpression > Property[key.name=/^(marginLeft|marginRight|paddingLeft|paddingRight|borderLeftWidth|borderRightWidth|borderLeftColor|borderRightColor|left|right)$/]',
          message:
            'Use the logical property (marginStart/marginEnd/paddingStart/paddingEnd/start/end). Physical properties do not flip in RTL, and Arabic is planned.',
        },
        {
          selector:
            "ObjectExpression > Property[key.name='textAlign'][value.value=/^(left|right)$/]",
          message:
            "Use textAlign: 'start' or 'end'. 'left'/'right' do not flip in RTL.",
        },
      ],
    },
  },
])
