import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  // One Storybook for the whole monorepo: the design-system primitives plus the
  // app-level dashboard components from apps/web.
  stories: [
    "../src/**/*.stories.@(ts|tsx)",
    "../../../apps/web/components/**/*.stories.@(ts|tsx)",
    "../../../apps/web/features/**/*.stories.@(ts|tsx)",
    "../../../libs/forms/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  viteFinal: (config) => {
    config.plugins = [tailwindcss(), ...(config.plugins ?? [])];
    // App-level stories live under apps/web, whose nearest tsconfig sets
    // `jsx: "preserve"` (required by Next.js). In Storybook's vite build that
    // makes esbuild fall back to the classic JSX runtime (React.createElement
    // with no auto-import) → "React is not defined" at render. Pin esbuild's
    // tsconfig to the automatic runtime, bypassing on-disk tsconfig discovery
    // so every story (DS and app) transforms the same way.
    config.esbuild = {
      ...config.esbuild,
      tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
    };
    // App client components import next/link and next/navigation, which have no
    // runtime under the react-vite builder. Alias them to lightweight stubs so
    // the app-layout stories render.
    // App data hooks read `process.env.NEXT_PUBLIC_API_URL` (state/api.ts). Next
    // inlines that at build time; Storybook's Vite builder doesn't, so `process`
    // is undefined in the browser. Statically replace the reference so the
    // expression resolves to the configured URL (or the local dev fallback).
    config.define = {
      ...config.define,
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333",
      ),
    };
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // `@/…` → apps/web root, mirroring the tsconfig `@/*` path so app-level
      // dashboard stories resolve their absolute imports under the Vite builder.
      "@": fileURLToPath(new URL("../../../apps/web", import.meta.url)),
      "next/link": fileURLToPath(new URL("./next-stubs/link.tsx", import.meta.url)),
      "next/navigation": fileURLToPath(new URL("./next-stubs/navigation.ts", import.meta.url)),
      // The contracts workspace package resolves to TS source, not a built
      // node_modules entry Rollup can find on its own (used by app data hooks).
      "@zibby/contracts": fileURLToPath(
        new URL("../../../libs/contracts/src/index.ts", import.meta.url),
      ),
      "@zibby/forms": fileURLToPath(new URL("../../../libs/forms/src/index.ts", import.meta.url)),
    };
    return config;
  },
};

export default config;
