import { initContract } from "@ts-rest/core";
import { RegistryBindingsSchema } from "./registry-bindings.schema";

const c = initContract();

/**
 * ZB-11 — the derived "Bound in" data for `/system/registries/[kind]` (O-09). A
 * single cross-cutting endpoint rather than widening the four entity schemas
 * (skills/mcp/hooks/commands) with a computed field threaded through every read
 * path — see `registry-bindings.schema.ts`'s docblock for the derivation rule.
 */
export const registriesContract = c.router(
  {
    getRegistryBindings: {
      method: "GET",
      path: "/registries/bindings",
      responses: {
        200: RegistryBindingsSchema,
      },
      summary: "Derived department bindings for every skill/mcp/hook/command id",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type RegistriesContract = typeof registriesContract;
