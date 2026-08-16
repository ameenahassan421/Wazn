/**
 * `app/_layout.tsx` imports `global.css` for its side effect — that import is
 * what makes Metro run the file through NativeWind's Tailwind pass, so it
 * cannot be dropped. TypeScript under `moduleResolution: bundler` rejects a
 * side-effect import of an unknown extension (TS2882) and looks for a
 * `<name>.d.<ext>.ts` sibling instead, which is this file. Without it the
 * import is a hard error and the styles are silently never compiled.
 */
export {}
