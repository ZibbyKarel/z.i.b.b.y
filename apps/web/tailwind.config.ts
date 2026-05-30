import type { Config } from "tailwindcss"
// Imported from source by relative path: Tailwind's config loader (jiti)
// transpiles the .ts, whereas the package's exports subpath points at .ts
// source that Node's resolver can't load at config time.
import { zibbyPreset } from "../../libs/design-system/src/theme/preset"

/**
 * The web app consumes the design system's preset (which replaces, not extends,
 * the Tailwind scale). `content` scans both the app and the DS source so every
 * class used by imported components is generated.
 *
 * Tailwind resolves content globs relative to `process.cwd()`, which differs
 * between `next dev` (run from the app dir) and `next build apps/web` (run from
 * the repo root). Both anchorings are listed; globs that match nothing are
 * silently ignored.
 */
export default {
  presets: [zibbyPreset],
  content: [
    // cwd = apps/web
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../libs/design-system/src/**/*.{ts,tsx}",
    // cwd = repo root
    "./apps/web/app/**/*.{ts,tsx}",
    "./apps/web/features/**/*.{ts,tsx}",
    "./libs/design-system/src/**/*.{ts,tsx}",
  ],
} satisfies Config
