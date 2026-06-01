import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { generateOpenApi } from "@ts-rest/open-api"
import { agentsContract } from "@zibby/contracts"
import * as swaggerUi from "swagger-ui-express"
import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  // Human-facing OpenAPI doc derived from the contract — a generated artifact,
  // not a source of truth. Served at /docs for inspection.
  const document = generateOpenApi(
    agentsContract,
    { info: { title: "Agents API", version: "1.0.0" } },
    { setOperationId: true },
  )
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document))

  const port = Number(process.env.PORT ?? 3333)
  await app.listen(port)
  Logger.log(`api listening on http://localhost:${port} (docs at /docs)`, "Bootstrap")
}

void bootstrap()
