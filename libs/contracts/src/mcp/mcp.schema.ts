import { z } from "zod";
import { AGENT_ID_REGEX } from "../agents/agent.schema";

/**
 * Allowed shape of an MCP server `id` — the same restrictive pattern agents use
 * (the id doubles as the on-disk file name AND as the server key passed to
 * `--mcp-config`, so no separators / traversal). The id also forms the
 * `mcp__<id>__*` allow-token, so it must be a clean identifier.
 */
export const McpServerIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

/** Transport an MCP server speaks. `type` is immutable after create (drives config). */
export const McpTransportSchema = z.enum(["stdio", "http", "sse"]);
export type McpTransport = z.infer<typeof McpTransportSchema>;

/**
 * A connected MCP server (managed from the UI). On disk: one `<id>.json` under
 * `data/mcp-servers`. The runner injects every ENABLED server into each run via
 * `--mcp-config` and widens `--allowedTools` with `mcp__<id>__*`. Secrets (auth
 * tokens, stdio env, secret headers) live in a separate gitignored store and are
 * never persisted on, nor served from, the entity — only `hasCredentials` is
 * exposed (Law 3 / credentials hygiene). `command`/`args` apply to stdio; `url`/
 * `headers` to http/sse (non-secret headers only — secret ones go in credentials).
 */
export const McpServerSchema = z.object({
  id: McpServerIdSchema,
  name: z.string().min(1).optional(),
  desc: z.string().optional(),
  type: McpTransportSchema,
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  /** Computed at read time: whether a credentials file exists. Never persisted. */
  hasCredentials: z.boolean().default(false),
});
export type McpServer = z.infer<typeof McpServerSchema>;

/**
 * Create body — id + type + the transport's connection fields. A `stdio` server
 * requires `command`; an `http`/`sse` server requires `url` (enforced by the
 * superRefine, surfaced as 422 by the controller). Status/computed fields are
 * server-owned, so omitted.
 */
export const CreateMcpServerSchema = z
  .object({
    id: McpServerIdSchema,
    name: z.string().min(1).optional(),
    desc: z.string().optional(),
    type: McpTransportSchema,
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "stdio" && !val.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stdio server requires a command",
        path: ["command"],
      });
    }
    if ((val.type === "http" || val.type === "sse") && !val.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "http/sse server requires a url",
        path: ["url"],
      });
    }
  });
export type CreateMcpServerInput = z.infer<typeof CreateMcpServerSchema>;

/**
 * Update body — `id`, `type` (drives the config union) and the computed
 * `hasCredentials` are immutable; the rest is partial.
 */
export const UpdateMcpServerSchema = McpServerSchema.omit({
  id: true,
  type: true,
  hasCredentials: true,
}).partial();
export type UpdateMcpServerInput = z.infer<typeof UpdateMcpServerSchema>;

/**
 * Closed, write-only credentials body. `env` injects secret env vars into a stdio
 * server's process; `headers` add secret request headers to an http/sse server;
 * `authToken` is shorthand for a Bearer header. Nothing else parses, so a
 * misdirected secret can't be stored. Write-only over HTTP — no read endpoint.
 */
export const McpCredentialsInputSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    authToken: z.string().min(1).optional(),
  })
  .strict();
export type McpCredentialsInput = z.infer<typeof McpCredentialsInputSchema>;
