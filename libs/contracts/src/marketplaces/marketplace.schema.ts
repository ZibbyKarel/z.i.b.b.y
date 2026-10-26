import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * A Claude Code plugin marketplace ZIBBY manages — its own record in
 * `data/marketplaces.json`. `id` is the marketplace `name` from its
 * `.claude-plugin/marketplace.json`. In dev mode `localPath` is the git checkout
 * installed plugins are symlinked into; `managedClone` marks a checkout ZIBBY
 * cloned itself (the only kind it ever pulls or deletes).
 */
export const MarketplaceSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  devMode: z.boolean(),
  localPath: z.string().optional(),
  managedClone: z.boolean(),
  addedAt: IsoDateTimeSchema,
});
export type Marketplace = z.infer<typeof MarketplaceSchema>;

/** A list-view marketplace: the record plus its plugin counts. */
export const MarketplaceSummarySchema = MarketplaceSchema.extend({
  pluginCount: z.number().int().nonnegative(),
  installedCount: z.number().int().nonnegative(),
});
export type MarketplaceSummary = z.infer<typeof MarketplaceSummarySchema>;

/** One named piece of a plugin (a skill, agent or command), read from its frontmatter. */
export const MarketplaceComponentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});
export type MarketplaceComponent = z.infer<typeof MarketplaceComponentSchema>;

/**
 * One plugin of a marketplace with its read-only component inventory and its
 * user-scope install state. `linked` = dev mode and the installPath is a symlink
 * to the plugin's dir inside the checkout.
 */
export const MarketplacePluginSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  installed: z.boolean(),
  installedVersion: z.string().optional(),
  linked: z.boolean(),
  skills: z.array(MarketplaceComponentSchema),
  agents: z.array(MarketplaceComponentSchema),
  commands: z.array(MarketplaceComponentSchema),
  hooks: z.boolean(),
  mcpServers: z.array(z.string()),
});
export type MarketplacePlugin = z.infer<typeof MarketplacePluginSchema>;

/** The marketplace detail: the record plus its catalog. */
export const MarketplaceDetailSchema = MarketplaceSchema.extend({
  description: z.string().optional(),
  plugins: z.array(MarketplacePluginSchema),
});
export type MarketplaceDetail = z.infer<typeof MarketplaceDetailSchema>;

/**
 * Connect a marketplace: a git repo / `owner/repo` / path. In dev mode an
 * absolute local path is used as-is and a git URL is cloned by ZIBBY.
 */
export const AddMarketplaceInputSchema = z.object({
  source: z.string().trim().min(1),
  devMode: z.boolean(),
});
export type AddMarketplaceInput = z.infer<typeof AddMarketplaceInputSchema>;

/** An installed marketplace skill, as the `/` autocomplete offers it (`zibby:standup-post`). */
export const MarketplaceSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  marketplace: z.string(),
  plugin: z.string(),
});
export type MarketplaceSkill = z.infer<typeof MarketplaceSkillSchema>;
