import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Anchor the Tailwind config by absolute path. `next build apps/web` runs with
// cwd = repo root (where Tailwind would otherwise find no config and fall back
// to an empty default), while `next dev` runs from the app dir — this resolves
// correctly for both.
const here = dirname(fileURLToPath(import.meta.url))

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    tailwindcss: { config: join(here, "tailwind.config.ts") },
    autoprefixer: {},
  },
}
