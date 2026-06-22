import "reflect-metadata";
import { writeHeapSnapshot } from "node:v8";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { initContract } from "@ts-rest/core";
import { generateOpenApi } from "@ts-rest/open-api";
import {
  agentRunsContract,
  agentsContract,
  approvalsContract,
  automationsContract,
  categoriesContract,
  gatesContract,
  healthContract,
  limitsContract,
  memoryContract,
  pipelineRunsContract,
  pipelinesContract,
  skillsContract,
  tasksContract,
} from "@zibby/contracts";
import * as swaggerUi from "swagger-ui-express";
import { AppModule } from "./app.module";
import { LoggerService } from "./shared/logging/logger.service";

// Compose the resource contracts into one router purely for documentation. Each
// child already carries its own `/api` prefix, so the parent adds none — paths
// stay `/api/agents` and `/api/health`.
const apiContract = initContract().router({
  agents: agentsContract,
  agentRuns: agentRunsContract,
  categories: categoriesContract,
  skills: skillsContract,
  pipelines: pipelinesContract,
  pipelineRuns: pipelineRunsContract,
  approvals: approvalsContract,
  gates: gatesContract,
  memory: memoryContract,
  automations: automationsContract,
  health: healthContract,
  limits: limitsContract,
  tasks: tasksContract,
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // The web app (Next.js, default :3000) is a different origin than this API
  // (:3333), so the browser needs CORS to read any response — plain fetch and a
  // future EventSource alike. Origins come from CORS_ORIGIN (comma-separated);
  // default to the local Next dev server.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  });

  // Human-facing OpenAPI doc derived from the contracts — a generated artifact,
  // not a source of truth. Served at /docs for inspection.
  const document = generateOpenApi(
    apiContract,
    { info: { title: "z.i.b.b.y API", version: "1.0.0" } },
    { setOperationId: true },
  );
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document));

  // Phase 12.3: arm NestJS shutdown hooks so every service's `onModuleDestroy`
  // (the run/verifier reapers) actually fires on SIGTERM — under `ts-node-dev
  // --respawn` and launchd a restart is a signal, not an `app.close()`, and
  // detached children would otherwise orphan and accumulate RAM.
  app.enableShutdownHooks();

  // A long-running daemon polls third-party channels (IMAP/Slack/…) whose client
  // libraries can reject a promise we don't own — e.g. a Gmail socket dropped after
  // the greeting surfaces as an `imapflow` rejection outside any `await` we control.
  // Route those through the structured logger (with the reason) instead of letting
  // `ts-node-dev`/launchd print a raw stack or treat it as fatal. The per-integration
  // watcher already stamps `lastError`; this is the floor for everything else, so the
  // process never dies silently on a stray library rejection (Law 5: always answerable).
  const log = app.get(LoggerService).child("UnhandledRejection");
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log.error("unhandled promise rejection", { error: err.message, stack: err.stack });
  });

  // Opt-in heap-snapshot trigger for diagnosing a live retention leak. With
  // `HEAP_SNAPSHOT_ON_SIGUSR2=1`, `kill -USR2 <pid>` writes a `.heapsnapshot` to
  // the cwd; two snapshots a few minutes apart, diffed in Chrome DevTools by
  // retained size, name what is actually being held — the decisive step for a
  // gradual leak that survives compaction. Gated (and off by default) because
  // `ts-node-dev --respawn` claims SIGUSR2 for its own restart; attach this only
  // on the compiled production process (the launchd/`node dist` path).
  if (process.env.HEAP_SNAPSHOT_ON_SIGUSR2 === "1") {
    const snap = app.get(LoggerService).child("HeapSnapshot");
    process.on("SIGUSR2", () => {
      try {
        const file = writeHeapSnapshot();
        snap.warn("wrote heap snapshot", { file });
      } catch (err) {
        snap.error("heap snapshot failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  // Default to 3333 (Phase 8.3) so the launchd plist can omit PORT and dev keeps
  // working — `Number(undefined)` was NaN. An explicit PORT (or a .env value) wins.
  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port);
  Logger.log(`api listening on http://localhost:${port} (docs at /docs)`, "Bootstrap");
}

void bootstrap();
