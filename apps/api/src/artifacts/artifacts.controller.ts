import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { artifactsContract } from "@zibby/contracts";
import { ArtifactsStorageService } from "./artifacts.storage.service";

/**
 * Implements `artifactsContract` — READ-ONLY. Records are born only inside the
 * API (the pipeline delivery sinks write them), so there is deliberately no
 * write endpoint: a client can never forge provenance.
 */
@Controller()
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsStorageService) {}

  @TsRestHandler(artifactsContract)
  handler() {
    return tsRestHandler(artifactsContract, {
      listArtifacts: async ({ query }) => ({
        status: 200,
        body: await this.artifacts.listFiltered(query),
      }),

      getArtifact: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.artifacts.get(id) };
        } catch {
          // Unknown, corrupt and malformed ids all read as absence.
          return { status: 404, body: { message: `Artifact "${id}" not found` } };
        }
      },
    });
  }
}
