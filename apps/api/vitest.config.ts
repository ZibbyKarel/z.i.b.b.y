import * as os from "node:os";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Phase 13.4 — tame under-load flakiness. ~90 e2e files each boot a full NestJS
// AppModule; at the default fork count (~cpus-1) that thrashes CPU + I/O (each fork
// also re-seeds a temp data dir, 12.5), so timing-sensitive assertions and slow
// requests intermittently exceed the default 5s timeout — a different suite each run,
// all green in isolation. Cap concurrency to ~half the cores and widen the timeouts so
// a slow-under-load boot/request doesn't trip. Logic is unchanged; this is contention.
// A few goal-loop e2e polls (real maker/verifier child processes) reliably exceed 30s
// on 2-fork ubuntu CI runners while passing near-instantly locally, so the budget is
// 60s (goal polls cap themselves at 45s, leaving headroom for a clean "until" error).
const maxForks = Math.max(2, Math.floor(os.cpus().length / 2));

// NestJS relies on `emitDecoratorMetadata` for dependency injection, which
// esbuild (Vitest's default transformer) does not emit. The SWC plugin emits it.
export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    poolOptions: { forks: { maxForks, minForks: 1 } },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2021",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
