import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// Root config so `npm test` runs the whole workspace's Vitest suites.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./libs/design-system/vitest.setup.ts"],
    include: ["libs/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
  },
})
