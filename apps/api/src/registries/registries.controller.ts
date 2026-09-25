import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { registriesContract } from "@zibby/contracts";
import { RegistriesService } from "./registries.service";

/** Implements `registriesContract` — see `RegistriesService` for the derivation. */
@Controller()
export class RegistriesController {
  constructor(private readonly registries: RegistriesService) {}

  @TsRestHandler(registriesContract)
  handler() {
    return tsRestHandler(registriesContract, {
      getRegistryBindings: async () => ({ status: 200, body: await this.registries.getBindings() }),
    });
  }
}
