import { runSelfKnowledgeCli } from "../../apps/api/src/self-knowledge/generate-cli";

/**
 * Thin CLI entry point (Fáze 1 — `docs/plans/phase-06.md`). Deliberately holds no
 * `@nestjs/*` (or other bare-specifier) imports of its own: this file lives
 * outside `apps/api`, so it has no `node_modules` ancestor carrying those
 * packages — only `apps/api/src/self-knowledge/generate-cli.ts` does, reachable
 * because IT lives inside `apps/api`. This file only ever uses a relative import
 * (plain path resolution, no `node_modules` lookup involved), so it type-checks
 * and runs regardless of which directory's `node_modules` is in scope.
 *
 * Run via `pnpm self-knowledge:generate` / `pnpm self-knowledge:check` (root
 * `package.json`) — both invoke this file through the `apps/api` workspace's own
 * `ts-node` (`pnpm --filter @zibby/api exec ts-node -P tsconfig.json …`), since
 * `ts-node` is a devDependency of `apps/api`, not the repo root, and `ts-node`'s
 * CLI (unlike a plain `require()`) resolves the entry script's own imports
 * relative to `process.cwd()` — `apps/api` once `--filter` sets it.
 */
runSelfKnowledgeCli(process.argv).catch((error) => {
  console.error("[self-knowledge] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
