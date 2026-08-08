import { mergeConfig } from 'vite'
import base from '../vite.config'

/**
 * The real build config, with every emitted chunk renamed.
 *
 * This exists only for `scripts/deploy-check.mjs`, which needs two builds that
 * disagree about filenames — the second deploy, from the point of view of a
 * page still running the first. Renaming through `rollupOptions.output` gets
 * that without editing a single source file, which matters: the first version
 * of that script appended a comment to four files and restored them in a
 * `finally`, and a script that can leave the working tree modified if it is
 * interrupted has no business being committed.
 */
export default mergeConfig(base, {
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-next-[hash].js',
        chunkFileNames: 'assets/[name]-next-[hash].js',
        assetFileNames: 'assets/[name]-next-[hash][extname]',
      },
    },
  },
})
