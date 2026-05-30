import type { Config } from "tailwindcss"
import { zibbyPreset } from "./src/theme/preset"

/**
 * Tailwind config for Storybook / isolated DS development. The web app has its
 * own config that also consumes `zibbyPreset` and points `content` at both the
 * app and this library.
 */
export default {
  presets: [zibbyPreset],
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config
