import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { marketplacesContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  InvalidMarketplaceSourceError,
  MarketplaceCliError,
  MarketplaceConflictError,
  MarketplaceNotFoundError,
  MarketplacePluginInstalledError,
  MarketplacePluginNotFoundError,
  UnsafeMarketplacePathError,
} from "./marketplaces.errors";
import { MarketplacesService } from "./marketplaces.service";

const errors = makeErrorMapper("Marketplace", {
  missing: [MarketplaceNotFoundError],
  conflict: [MarketplaceConflictError],
});

const message = (error: Error) => ({ message: error.message });

/** A failed `claude`/`git` child → 502 with its stderr; an unknown plugin → 404. */
const cliOr404 = (error: unknown) => {
  if (error instanceof MarketplaceCliError) return { status: 502 as const, body: message(error) };
  if (error instanceof MarketplacePluginNotFoundError) {
    return { status: 404 as const, body: message(error) };
  }
  return undefined;
};

/** Any mutation: a refused path → 422, else as {@link cliOr404}. */
const mutationErrors = (error: unknown) => {
  if (error instanceof UnsafeMarketplacePathError) {
    return { status: 422 as const, body: message(error) };
  }
  return cliOr404(error);
};

/** Install: an already-installed plugin → 409, else as {@link mutationErrors}. */
const installErrors = (error: unknown) => {
  if (error instanceof MarketplacePluginInstalledError) {
    return { status: 409 as const, body: message(error) };
  }
  return mutationErrors(error);
};

/** Connect: a bad source → 400, a refused path → 422, a CLI failure → 502 (a duplicate id → 409 via the mapper). */
const addErrors = (error: unknown) => {
  if (error instanceof InvalidMarketplaceSourceError) {
    return { status: 400 as const, body: message(error) };
  }
  if (error instanceof UnsafeMarketplacePathError) {
    return { status: 422 as const, body: message(error) };
  }
  if (error instanceof MarketplaceCliError) return { status: 502 as const, body: message(error) };
  return undefined;
};

/** Implements `marketplacesContract` over {@link MarketplacesService}. */
@Controller()
export class MarketplacesController {
  constructor(private readonly marketplaces: MarketplacesService) {}

  @TsRestHandler(marketplacesContract)
  handler() {
    return tsRestHandler(marketplacesContract, {
      listMarketplaces: async () => ({ status: 200, body: await this.marketplaces.list() }),

      addMarketplace: ({ body }) => errors.created(() => this.marketplaces.add(body), addErrors),

      getMarketplace: ({ params: { id } }) =>
        errors.or404(id, () => this.marketplaces.get(id), cliOr404),

      removeMarketplace: ({ params: { id } }) =>
        errors.or404(id, () => this.marketplaces.remove(id), mutationErrors),

      updateMarketplace: ({ params: { id } }) =>
        errors.or404(id, () => this.marketplaces.update(id), mutationErrors),

      installAllPlugins: ({ params: { id } }) =>
        errors.or404(id, () => this.marketplaces.installAll(id), mutationErrors),

      installPlugin: ({ params: { id, plugin } }) =>
        errors.or404(id, () => this.marketplaces.install(id, plugin), installErrors),

      uninstallPlugin: ({ params: { id, plugin } }) =>
        errors.or404(id, () => this.marketplaces.uninstall(id, plugin), mutationErrors),

      listMarketplaceSkills: async () => ({ status: 200, body: await this.marketplaces.skills() }),
    });
  }
}
