import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component tests for apps/web run under jsdom + React (the `web` project stays
// node-only for the i18n catalog checks). Covers components/** plus the feature
// composites' own components/** folders.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the workspace packages to their TS source, mirroring the tsconfig
    // path mappings the Next app builds with (contracts has no node_modules entry
    // Vite can resolve on its own).
    alias: {
      // `@/…` → apps/web root, mirroring the tsconfig `@/*` path (Vite doesn't
      // read tsconfig `paths`/`baseUrl`, so it needs the alias spelled out).
      "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
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
    include: [
      "components/**/*.test.{ts,tsx}",
      "features/**/components/**/*.test.{ts,tsx}",
      // Feature-root unit tests (pure view-model/presentation helpers).
      "features/*/*.test.{ts,tsx}",
      // Feature hooks (client-side browser-API wrappers).
      "features/*/hooks/**/*.test.{ts,tsx}",
    ],
  },
});
