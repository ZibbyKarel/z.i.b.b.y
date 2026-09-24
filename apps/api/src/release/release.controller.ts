import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { releaseContract } from "@zibby/contracts";
import { ReleaseService } from "./release.service";

/**
 * Implements `releaseContract` — READ-ONLY. Merging stays the operator's
 * existing gated `POST /projects/:id/prs/:number/merge`
 * (`ProjectPrService.merge`, `ProjectsController`); this controller has no
 * write route.
 */
@Controller()
export class ReleaseController {
  constructor(private readonly release: ReleaseService) {}

  @TsRestHandler(releaseContract)
  handler() {
    return tsRestHandler(releaseContract, {
      getMergeQueue: async ({ query }) => ({ status: 200, body: await this.release.queue(query) }),
    });
  }
}
