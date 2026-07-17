import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { maestroContract } from "@zibby/contracts";
import { MaestroService } from "./maestro.service";

/**
 * Implements `maestroContract` — READ-ONLY. Merging stays the operator's
 * existing gated `POST /projects/:id/prs/:number/merge`
 * (`ProjectPrService.merge`, `ProjectsController`); this controller has no
 * write route.
 */
@Controller()
export class MaestroController {
  constructor(private readonly maestro: MaestroService) {}

  @TsRestHandler(maestroContract)
  handler() {
    return tsRestHandler(maestroContract, {
      getMergeQueue: async ({ query }) => ({ status: 200, body: await this.maestro.queue(query) }),
    });
  }
}
