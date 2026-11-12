import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { MODEL_TIERS, type SystemConfig, systemContract } from "@zibby/contracts";
import { requireOperatorTokenIf } from "../approvals/operator-token.guard";
import { OperatorTokenService } from "../approvals/operator-token.service";
import { SystemConfigStore } from "./system-config.store";

/** Implements `systemContract` — the operator-owned runtime system config. */
@Controller()
export class SystemController {
  constructor(
    private readonly config: SystemConfigStore,
    private readonly tokens: OperatorTokenService,
  ) {}

  @TsRestHandler(systemContract)
  handler() {
    return tsRestHandler(systemContract, {
      getConfig: async () => ({ status: 200, body: await this.config.read() }),
      putConfig: async ({ body, headers }) => ({
        status: 200,
        body: await this.putConfig(body, headers),
      }),
    });
  }

  /** Switching the engine / model changes what runs every agent — operator only (401). */
  async putConfig(body: SystemConfig, headers: Record<string, unknown>): Promise<SystemConfig> {
    const cur = await this.config.read();
    requireOperatorTokenIf(
      body.aiEngine !== cur.aiEngine ||
        body.opencodeModel !== cur.opencodeModel ||
        MODEL_TIERS.some(
          (t) => (body.opencodeTierModels?.[t] ?? "") !== (cur.opencodeTierModels?.[t] ?? ""),
        ),
      this.tokens,
      headers,
      "Changing the AI engine or model",
    );
    return this.config.write(body);
  }
}
