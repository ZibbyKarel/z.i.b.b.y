import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `@/…` → apps/web root, mirroring the tsconfig `@/*` path (Vite doesn't
    // read tsconfig `paths`/`baseUrl`, so it needs the alias spelled out).
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
    },
  },
  test: {
    name: "web",
    environment: "node",
    globals: true,
    // Scoped to the i18n catalog checks and pure utils. The legacy component
    // tests under features/** predate the next-intl provider and are
    // intentionally NOT wired into the workspace; widening this glob to
    // features/** would start running them.
    include: ["i18n/**/*.test.ts", "utils/**/*.test.ts"],
  },
});
