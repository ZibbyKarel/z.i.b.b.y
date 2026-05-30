import type { Config } from "tailwindcss"
import {
  borderRadius,
  boxShadow,
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
} from "./tokens"

/**
 * The z.i.b.b.y Tailwind preset.
 *
 * It REPLACES the default Tailwind theme (note: `theme`, not `theme.extend`)
 * so the generated CSS contains only project tokens — no stray `gray-100` or
 * `blue-500`. Apps consume this preset and never define their own scale.
 *
 * Spacing is redefined explicitly (a clean px ladder) rather than extended, so
 * familiar utilities like `gap-2`/`p-4` still exist but resolve to our scale.
 */
export const zibbyPreset: Config = {
  content: [],
  darkMode: "class",
  theme: {
    colors,
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    borderRadius,
    boxShadow,
    spacing: {
      px: "1px",
      0: "0",
      0.5: "2px",
      1: "4px",
      1.5: "6px",
      2: "8px",
      2.5: "10px",
      3: "12px",
      3.5: "14px",
      4: "16px",
      5: "18px",
      6: "22px",
      7: "26px",
      8: "32px",
      9: "36px",
      10: "40px",
      11: "44px",
      12: "48px",
      14: "56px",
      16: "64px",
      18: "72px",
      20: "80px",
      24: "96px",
      28: "112px",
      32: "128px",
      40: "160px",
      48: "192px",
      56: "224px",
      64: "256px",
    },
    extend: {
      keyframes: {
        zpulse: {
          "0%": { transform: "scale(0.8)", opacity: "0.5" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        zpulse: "zpulse 1.8s ease-out infinite",
        "fade-in": "fade-in 0.16s ease-out",
        "scale-in": "scale-in 0.16s ease-out",
      },
    },
  },
}

export default zibbyPreset
