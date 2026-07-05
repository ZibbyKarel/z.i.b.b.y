import "reflect-metadata";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SelfKnowledgeService } from "./self-knowledge.service";

/**
 * Pin a RELATIVE `ZIBBY_DATA_DIR` to where the operator actually invoked pnpm.
 * The root `self-knowledge:*` scripts run this file through
 * `pnpm --filter @zibby/api exec`, which sets the process cwd to `apps/api` — so
 * `resolveDataRoot()`'s plain `path.resolve(root)` would silently resolve e.g.
 * `ZIBBY_DATA_DIR=apps/api/data-test` to `apps/api/apps/api/data-test`. pnpm
 * exports `INIT_CWD` (the invocation directory, i.e. the repo root for a root
 * script), which is the base the operator means. Absolute values pass through
 * untouched. Must run before `NestFactory` instantiates the `*_DIR` providers.
 */
function pinRelativeDataDir(): void {
  const root = process.env.ZIBBY_DATA_DIR;
  if (!root || path.isAbsolute(root)) return;
  process.env.ZIBBY_DATA_DIR = path.resolve(process.env.INIT_CWD ?? process.cwd(), root);
}

/**
 * The actual CLI logic behind `tools/self-knowledge/generate.ts`, kept inside
 * `apps/api/src` (not `tools/`) so its `@nestjs/*` imports resolve normally under
 * both `ts-node` and `tsc` — those bare specifiers only exist in `apps/api`'s own
 * `node_modules`, reachable by walking up from THIS file's location but not from
 * a file living outside `apps/api` (see the CLI wrapper for the full story).
 *
 * Boots the same `AppModule` the server does via `createApplicationContext` (no
 * HTTP listener), so it reads the exact same agents/pipelines/gate-rules/policy/
 * vault the running API would.
 *
 * Two modes:
 *   - default (`argv` has no `--check`): compose fresh content, write-or-merge it
 *     into the vault note, print the note's path.
 *   - `--check`: compose fresh content and compare it against the current note
 *     WITHOUT writing; sets `process.exitCode = 1` with a clear message on drift
 *     (the pre-commit hook and CI step both use this mode).
 */
export async function runSelfKnowledgeCli(argv: readonly string[]): Promise<void> {
  pinRelativeDataDir();
  const check = argv.includes("--check");
  // `logger: false` — this is a CLI, not the server; Nest's boot banner is noise here.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const service = app.get(SelfKnowledgeService);

    if (check) {
      const drift = await service.check();
      if (drift) {
        console.error(
          "[self-knowledge] drift detected — the self-knowledge vault note is stale.\n" +
            "Run `pnpm self-knowledge:generate` and commit the result.",
        );
        process.exitCode = 1;
        return;
      }
      console.log("[self-knowledge] up to date — no drift.");
      return;
    }

    const note = await service.write();
    console.log(`[self-knowledge] wrote note: ${note.path}`);
  } finally {
    await app.close();
  }
}
