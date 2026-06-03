import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { initContract } from "@ts-rest/core"
import { generateOpenApi } from "@ts-rest/open-api"
import {
  agentRunsContract,
  agentsContract,
  categoriesContract,
  healthContract,
  limitsContract,
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
  health: healthContract,
  limits: limitsContract,
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

  const port = Number(process.env.PORT ?? 3333)
  await app.listen(port)
  Logger.log(`api listening on http://localhost:${port} (docs at /docs)`, "Bootstrap")
}

void bootstrap()
