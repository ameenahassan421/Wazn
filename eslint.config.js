import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      // The Expo app is linted by its own `expo lint`, against React Native
      // rules. Running the web config over it would flag every RN style
      // object and miss everything that actually matters there.
      'mobile',
      '.agents',
      '.claude/worktrees',
      'coverage',
      'test-results',
      'playwright-report',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        // useUnit lives beside its provider on purpose; splitting the hook into
        // its own file to satisfy fast refresh would not make it clearer.
        { allowConstantExport: true, allowExportNames: ['useUnit', 'useLocale'] },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // This app is direction-agnostic on purpose: it will grow an Arabic RTL
      // locale, so layout may only use logical properties. These two rules fail
      // the build on a physical left/right utility or CSS property.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name="className"] > Literal[value=/(^|[\\s"\'`])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|inset-l|inset-r)-/]',
          message:
            'Use logical utilities (ms/me, ps/pe, start/end, border-s/border-e, rounded-s/rounded-e) — this app must work in RTL.',
        },
        {
          selector:
            'JSXAttribute[name.name="className"] > Literal[value=/(^|[\\s"\'`])text-(left|right)($|[\\s"\'`])/]',
          message: 'Use text-start / text-end instead of text-left / text-right.',
        },
      ],
    },
  },
  {
    // Scripts are Node-only and may log freely.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
