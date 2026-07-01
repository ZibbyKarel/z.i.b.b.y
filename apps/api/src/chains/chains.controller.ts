import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { chainsContract } from "@zibby/contracts";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import {
  ChainConflictError,
  ChainNotFoundError,
  ChainsStorageService,
  InvalidChainIdError,
} from "./chains.storage.service";

/** Implements `chainsContract` — the operator's chain compositions (CRUD minus update). */
@Controller()
export class ChainsController {
  constructor(
    private readonly chains: ChainsStorageService,
    private readonly pipelines: PipelinesStorageService,
  ) {}

  @TsRestHandler(chainsContract)
  handler() {
    return tsRestHandler(chainsContract, {
      listChains: async () => ({ status: 200, body: await this.chains.list() }),

      createChain: async ({ body }) => {
        // Every step must name a stored pipeline — a chain with a dangling step
        // would only discover it at run time, mid-sequence (422 now instead).
        for (const step of body.steps) {
          const exists = await this.pipelines.get(step.pipeline).catch(() => null);
          if (!exists) {
            return {
              status: 422,
              body: { message: `Step pipeline "${step.pipeline}" does not exist` },
            };
          }
        }
        try {
          return { status: 201, body: await this.chains.create(body) };
        } catch (error) {
          if (error instanceof ChainConflictError) {
            return { status: 409, body: { message: error.message } };
          }
          if (error instanceof InvalidChainIdError) {
            return { status: 422, body: { message: error.message } };
          }
          throw error;
        }
      },

      getChain: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.chains.get(id) };
        } catch (error) {
          if (error instanceof ChainNotFoundError || error instanceof InvalidChainIdError) {
            return { status: 404, body: { message: `Chain "${id}" not found` } };
          }
          throw error;
        }
      },

      deleteChain: async ({ params: { id } }) => {
        try {
          await this.chains.delete(id);
          return { status: 200, body: { id } };
        } catch (error) {
          if (error instanceof ChainNotFoundError || error instanceof InvalidChainIdError) {
            return { status: 404, body: { message: `Chain "${id}" not found` } };
          }
          throw error;
        }
      },
    });
  }
}
