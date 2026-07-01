import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { chainRunsContract } from "@zibby/contracts";
import { ChainRunNotFoundError, ChainRunnerService } from "./chain-runner.service";
import { ChainNotFoundError, InvalidChainIdError } from "./chains.storage.service";

/**
 * Implements `chainRunsContract`. Declared BEFORE {@link ChainsController} in the
 * module so its static `/chains/runs` routes register ahead of `/chains/:id`
 * (which would otherwise capture "runs" as a chain id) — same ordering trick as
 * the pipelines module.
 */
@Controller()
export class ChainRunsController {
  constructor(private readonly runner: ChainRunnerService) {}

  @TsRestHandler(chainRunsContract)
  handler() {
    return tsRestHandler(chainRunsContract, {
      startChain: async ({ params: { id } }) => {
        try {
          return { status: 201, body: await this.runner.start(id) };
        } catch (error) {
          if (error instanceof ChainNotFoundError || error instanceof InvalidChainIdError) {
            return { status: 404, body: { message: error.message } };
          }
          throw error;
        }
      },

      listChainRuns: async () => ({ status: 200, body: this.runner.list() }),

      getChainRun: async ({ params: { id } }) => {
        try {
          return { status: 200, body: this.runner.get(id) };
        } catch (error) {
          if (error instanceof ChainRunNotFoundError) {
            return { status: 404, body: { message: error.message } };
          }
          throw error;
        }
      },
    });
  }
}
