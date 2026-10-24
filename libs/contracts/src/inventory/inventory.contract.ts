import { initContract } from "@ts-rest/core";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import { InstallSkillResultSchema, MachineInventorySchema } from "./inventory.schema";

const c = initContract();

/**
 * Machine inventory (TODO 13): what the operator's Claude Code has (MCP
 * servers, skills, plugins) plus the ZIBBY skill library's install status.
 * Reads are fail-soft and secret-free; the only write is `installSkill`,
 * which writes one ZIBBY-managed `SKILL.md` into the user's Claude skills dir.
 */
export const inventoryContract = c.router(
  {
    getInventory: {
      method: "GET",
      path: "/inventory",
      responses: { 200: MachineInventorySchema },
      summary: "Scan this machine's Claude Code MCP servers, skills and plugins",
    },
    installSkill: {
      method: "POST",
      path: "/inventory/skills/:skillId/install",
      body: EmptyBodySchema,
      responses: {
        200: InstallSkillResultSchema,
        404: ErrorSchema,
        /** A non-ZIBBY skill of that name already exists on the machine. */
        409: ErrorSchema,
      },
      summary: "Install a ZIBBY library skill into the user's Claude Code skills",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type InventoryContract = typeof inventoryContract;
