import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// Component tests for apps/web run under jsdom + React (the `web` project stays
// node-only for the i18n catalog checks). Scoped strictly to components/** so the
// deliberately-excluded legacy feature tests under features/** stay out.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the workspace packages to their TS source, mirroring the tsconfig
    // path mappings the Next app builds with (contracts has no node_modules entry
    // Vite can resolve on its own).
    alias: {
      "@zibby/contracts": fileURLToPath(
        new URL("../../libs/contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "web-components",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.tsx"],
    include: ["components/**/*.test.{ts,tsx}"],
  },
})
