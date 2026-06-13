import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { initContract } from "@ts-rest/core"
import { generateOpenApi } from "@ts-rest/open-api"
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
} from "@zibby/contracts"
import * as swaggerUi from "swagger-ui-express"
import { AppModule } from "./app.module"

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
})

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  // The web app (Next.js, default :3000) is a different origin than this API
  // (:3333), so the browser needs CORS to read any response — plain fetch and a
  // future EventSource alike. Origins come from CORS_ORIGIN (comma-separated);
  // default to the local Next dev server.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  })

  // Human-facing OpenAPI doc derived from the contracts — a generated artifact,
  // not a source of truth. Served at /docs for inspection.
  const document = generateOpenApi(
    apiContract,
    { info: { title: "z.i.b.b.y API", version: "1.0.0" } },
    { setOperationId: true },
  )
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document))

  // Phase 12.3: arm NestJS shutdown hooks so every service's `onModuleDestroy`
  // (the run/verifier reapers) actually fires on SIGTERM — under `ts-node-dev
  // --respawn` and launchd a restart is a signal, not an `app.close()`, and
  // detached children would otherwise orphan and accumulate RAM.
  app.enableShutdownHooks()

  // Default to 3333 (Phase 8.3) so the launchd plist can omit PORT and dev keeps
  // working — `Number(undefined)` was NaN. An explicit PORT (or a .env value) wins.
  const port = Number(process.env.PORT ?? 3333)
  await app.listen(port)
  Logger.log(`api listening on http://localhost:${port} (docs at /docs)`, "Bootstrap")
}

void bootstrap()
