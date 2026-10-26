import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  AddMarketplaceInputSchema,
  MarketplaceDetailSchema,
  MarketplaceSkillSchema,
  MarketplaceSummarySchema,
} from "./marketplace.schema";

const c = initContract();

const idParams = z.object({ id: z.string().min(1) });
const pluginParams = z.object({ id: z.string().min(1), plugin: z.string().min(1) });

/**
 * Claude Code plugin marketplaces connected to ZIBBY. Mutations drive the
 * `claude plugin` CLI (user scope); a CLI failure surfaces as 502 carrying the
 * CLI's own message, a filesystem guard refusing a path (e.g. an install dir
 * outside the plugins cache) as 422, re-installing an installed plugin as 409.
 */
export const marketplacesContract = c.router(
  {
    listMarketplaces: {
      method: "GET",
      path: "/marketplaces",
      responses: { 200: z.array(MarketplaceSummarySchema) },
      summary: "List the connected marketplaces",
    },
    addMarketplace: {
      method: "POST",
      path: "/marketplaces",
      body: AddMarketplaceInputSchema,
      responses: {
        201: MarketplaceDetailSchema,
        400: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Connect a marketplace",
    },
    getMarketplace: {
      method: "GET",
      path: "/marketplaces/:id",
      pathParams: idParams,
      responses: { 200: MarketplaceDetailSchema, 404: ErrorSchema, 502: ErrorSchema },
      summary: "Get a marketplace with its plugins",
    },
    removeMarketplace: {
      method: "DELETE",
      path: "/marketplaces/:id",
      pathParams: idParams,
      responses: {
        200: z.object({ id: z.string() }),
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Uninstall its plugins and disconnect a marketplace",
    },
    updateMarketplace: {
      method: "POST",
      path: "/marketplaces/:id/update",
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: MarketplaceDetailSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Pull the newest versions of the installed plugins",
    },
    installAllPlugins: {
      method: "POST",
      path: "/marketplaces/:id/install-all",
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: MarketplaceDetailSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Install every plugin of a marketplace",
    },
    installPlugin: {
      method: "POST",
      path: "/marketplaces/:id/plugins/:plugin/install",
      pathParams: pluginParams,
      body: c.noBody(),
      responses: {
        200: MarketplaceDetailSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Install one plugin",
    },
    uninstallPlugin: {
      method: "DELETE",
      path: "/marketplaces/:id/plugins/:plugin",
      pathParams: pluginParams,
      responses: {
        200: MarketplaceDetailSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Uninstall one plugin",
    },
    listMarketplaceSkills: {
      method: "GET",
      path: "/marketplace-skills",
      responses: { 200: z.array(MarketplaceSkillSchema) },
      summary: "List the skills of installed marketplace plugins",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type MarketplacesContract = typeof marketplacesContract;
