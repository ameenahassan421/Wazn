/**
 * `babel-preset-expo` already carries the JSX transform, the Reanimated
 * plugin and (when `experiments.reactCompiler` is on) the React Compiler.
 * NativeWind adds one thing: `jsxImportSource`, which routes every element
 * through its own `jsx` so a `className` prop becomes a style at build time.
 *
 * Nothing else belongs here. A plugin added to this file runs on every file
 * in the bundle including the shared domain modules, which is the one place
 * this app must stay boring.
 */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
