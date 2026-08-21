/**
 * `babel-preset-expo` and nothing else.
 *
 * It already carries the JSX transform, the Reanimated/worklets plugin and
 * (when `experiments.reactCompiler` is on) the React Compiler.
 *
 * ── NATIVEWIND WAS HERE AND IS NOT ANY MORE (2026-08-20) ────────────────────
 * It added `jsxImportSource: 'nativewind'` plus its own preset, which routed
 * every element in the bundle through NativeWind's `jsx` so a `className`
 * could become a style at build time. The app used `className` **zero times**
 * — the whole UI resolves through `design/Txt.tsx` and `components/ui/`, in
 * plain JS, because React Native picks a font cut by family NAME and a
 * utility class cannot express that.
 *
 * So it was pure cost: Tailwind pinned to 3.4 while the web app is on v4
 * (which is WHY the two packages needed separate lockfiles), an extra
 * transform over every file including the shared domain modules, and a
 * `cssInterop` on `Pressable` that silently dropped a function `style` and
 * rendered every button in the app invisible for three days.
 *
 * Nothing else belongs here. A plugin added to this file runs on every file in
 * the bundle including the shared domain modules, which is the one place this
 * app must stay boring.
 */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
