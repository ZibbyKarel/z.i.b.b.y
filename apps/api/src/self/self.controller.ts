import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { selfContract } from "@zibby/contracts";
import { SelfDirtyError, SelfService, SelfUpdateConflictError } from "./self.service";

/**
 * Implements `selfContract` against {@link SelfService}. `getSelfStatus` never
 * fails the request — the service itself soft-fails every sub-step. `updateSelf`
 * maps the two refusal errors (dirty tree, non-fast-forward) to a 409 with a
 * human-readable message; any other error is a genuine 500.
 */
@Controller()
export class SelfController {
  constructor(private readonly self: SelfService) {}

  @TsRestHandler(selfContract)
  handler() {
    return tsRestHandler(selfContract, {
      getSelfStatus: async () => ({ status: 200, body: await this.self.status() }),

      updateSelf: async () => {
        try {
          return { status: 200, body: await this.self.update() };
        } catch (error) {
          if (error instanceof SelfDirtyError || error instanceof SelfUpdateConflictError) {
            return { status: 409, body: { message: error.message } };
          }
          throw error;
        }
      },
    });
  }
}
