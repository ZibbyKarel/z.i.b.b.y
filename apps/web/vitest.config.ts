import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    globals: true,
    // Scoped to the i18n catalog checks only. The legacy component tests under
    // features/** predate the next-intl provider and are intentionally NOT
    // wired into the workspace; widening this glob would start running them.
    include: ["i18n/**/*.test.ts"],
  },
})
