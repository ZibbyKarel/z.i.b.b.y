import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { subsystemsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { SubsystemNotFoundError } from "./subsystems.errors";
import { SubsystemsService } from "./subsystems.service";

const errors = makeErrorMapper("Subsystem", {
  missing: [SubsystemNotFoundError],
});

/**
 * Implements `subsystemsContract` against the fixed `SUBSYSTEMS` registry. Not to
 * be confused with `HealthModule`'s `SubsystemHealthService` — unrelated concept
 * (liveness of backend/vault/integrations/scheduler), never touched here.
 */
@Controller()
export class SubsystemsController {
  constructor(private readonly subsystems: SubsystemsService) {}

  @TsRestHandler(subsystemsContract)
  handler() {
    return tsRestHandler(subsystemsContract, {
      getSubsystems: async () => ({ status: 200, body: await this.subsystems.list() }),

      getSubsystem: ({ params: { id } }) =>
        errors.or404(id, async () => this.subsystems.get(id)),

      markSubsystemSeen: ({ params: { id } }) =>
        errors.or404(id, async () => this.subsystems.markSeen(id)),
    });
  }
}
