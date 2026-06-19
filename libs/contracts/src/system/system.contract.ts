import { initContract } from "@ts-rest/core";
import { SystemConfigSchema } from "./system.schema";

const c = initContract();

/**
 * Runtime system config (formerly start-only env vars). Operator-owned and
 * file-backed — same posture as the research/mandate/budget config. `getConfig`
 * reads the effective config (schema defaults when no file); `putConfig` replaces
 * the whole document. Tick/adapter changes apply live (the schedulers re-arm); the
 * `goalAutoResume` knob applies on the next boot.
 */
export const systemContract = c.router(
  {
    getConfig: {
      method: "GET",
      path: "/system/config",
      responses: { 200: SystemConfigSchema },
      summary: "Get the runtime system config",
    },
    putConfig: {
      method: "PUT",
      path: "/system/config",
      body: SystemConfigSchema,
      responses: { 200: SystemConfigSchema },
      summary: "Replace the runtime system config",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type SystemContract = typeof systemContract;
