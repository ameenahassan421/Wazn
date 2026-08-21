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
          // NativeWind 4.2.6 applies `cssInterop` to Pressable so it can take
          // a `className`. A FUNCTION `style` does not survive that: it is
          // dropped whole, and the control renders with no background, no
          // height, no padding and no flexDirection while still taking taps.
          //
          // On 2026-08-20 every button in the native app was invisible for
          // this reason — SIGN IN was a gap in the layout — through a green
          // tsc, a green eslint and a green `expo export`. Use
          // `onPressIn`/`onPressOut` state instead; `Btn.tsx` is the pattern.
          selector:
            "JSXOpeningElement[name.name='Pressable'] > JSXAttribute[name.name='style'] > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)",
          message:
            'Pressable style must be an object or array, never a function. NativeWind drops the callback form and the control renders unstyled. Track the pressed state with onPressIn/onPressOut (see Btn.tsx).',
        },
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
        {
          // `src/design/Txt.tsx` has claimed since it was written that "a lint
          // rule enforces it". No such rule existed until 2026-08-19, and
          // `app/_layout.tsx` was already rendering a bare <Text>. A comment
          // that claims enforcement is worse than no comment: the next session
          // reads it and believes it.
          //
          // Worth a rule rather than a screenshot because RN's default is the
          // system sans at 14px in BLACK, which on this ground is invisible
          // rather than wrong, and invisible is the one defect a screenshot
          // pass genuinely misses.
          selector: "JSXOpeningElement[name.name='Text']",
          message:
            'Use <Txt step="..."> from @/design/Txt. A bare <Text> is the system sans at 14px in black, invisible on this ground.',
        },
      ],
    },
  },
  {
    // The two legitimate bare <Text> sites in the package, both because they
    // are the thing the rule points at rather than users of it.
    //
    // `Txt` IS the wrapper everything else funnels through, so it must render
    // one. `Wordmark` is the brand mark, and the whole reason it exists as its
    // own file is that a wordmark must NOT inherit a ramp step: the header set
    // it with the figures step (weight 600, tabular) and auth with `hero`
    // (uppercase at 50), which is how the app came to render WAZN. Routing it
    // back through `Txt` would reintroduce exactly that.
    //
    // Scoped to the two files rather than inline disables, so every exemption
    // is visible here instead of buried in the source.
    files: ['src/design/Txt.tsx', 'src/components/ui/Wordmark.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
