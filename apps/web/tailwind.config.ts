import type { Config } from "tailwindcss"
// Imported from source by relative path: Tailwind's config loader (jiti)
// transpiles the .ts, whereas the package's exports subpath points at .ts
// source that Node's resolver can't load at config time.
import { zibbyPreset } from "../../libs/design-system/src/theme/preset"

/**
 * The web app consumes the design system's preset (which replaces, not extends,
 * the Tailwind scale). `content` scans both the app and the DS source so every
 * class used by imported components is generated.
 */
export default {
  presets: [zibbyPreset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../libs/design-system/src/**/*.{ts,tsx}",
  ],
} satisfies Config
