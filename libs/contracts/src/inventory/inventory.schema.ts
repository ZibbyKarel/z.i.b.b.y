import { z } from "zod";
import { SkillIdSchema } from "../skills/skill.schema";

/**
 * TODO 13 — a read-only view of the operator's Claude Code installation on the
 * machine ZIBBY runs on. MCP `args`, `env` and `headers` are NEVER part of it
 * (they hold secrets): an MCP server exposes only name, scope, transport and a
 * sanitised target (the command basename, or the URL origin).
 */
export const InventoryMcpScopeSchema = z.enum(["user", "project", "local", "plugin"]);
export const InventoryMcpTransportSchema = z.enum(["stdio", "http", "sse", "unknown"]);

export const InventoryMcpServerSchema = z.object({
  name: z.string(),
  scope: InventoryMcpScopeSchema,
  transport: InventoryMcpTransportSchema,
  /** Command basename (stdio) or URL origin (http/sse); omitted when unparsable. */
  target: z.string().optional(),
  /** The owning plugin id when `scope` is `plugin`. */
  plugin: z.string().optional(),
});
export type InventoryMcpServer = z.infer<typeof InventoryMcpServerSchema>;

export const InventorySkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Capped at 300 chars. */
  description: z.string().optional(),
  source: z.enum(["user", "plugin"]),
  plugin: z.string().optional(),
  /** True when the SKILL.md frontmatter carries `managed-by: zibby`. */
  zibbyManaged: z.boolean(),
});
export type InventorySkill = z.infer<typeof InventorySkillSchema>;

export const InventoryPluginSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
  scope: z.string().optional(),
  enabled: z.boolean(),
  skillCount: z.number().int().min(0),
  mcpCount: z.number().int().min(0),
});
export type InventoryPlugin = z.infer<typeof InventoryPluginSchema>;

export const InventoryCatalogStatusSchema = z.enum([
  "not-installed",
  "installed",
  "outdated",
  "conflict",
]);
export type InventoryCatalogStatus = z.infer<typeof InventoryCatalogStatusSchema>;

export const InventoryCatalogEntrySchema = z.object({
  skillId: SkillIdSchema,
  name: z.string(),
  desc: z.string().optional(),
  status: InventoryCatalogStatusSchema,
});
export type InventoryCatalogEntry = z.infer<typeof InventoryCatalogEntrySchema>;

export const MachineInventorySchema = z.object({
  mcp: z.array(InventoryMcpServerSchema),
  skills: z.array(InventorySkillSchema),
  plugins: z.array(InventoryPluginSchema),
  catalog: z.array(InventoryCatalogEntrySchema),
});
export type MachineInventory = z.infer<typeof MachineInventorySchema>;

export const InstallSkillResultSchema = z.object({
  skillId: SkillIdSchema,
  status: z.literal("installed"),
});
export type InstallSkillResult = z.infer<typeof InstallSkillResultSchema>;
