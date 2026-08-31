import { Module } from "@nestjs/common";
import { KbAuthModule } from "../kb/kb-auth.module";
import { dataDir } from "../shared/data-dir";
import { MCP_CREDENTIALS_DIR, McpCredentialsStore } from "./mcp-credentials.store";
import { McpController } from "./mcp.controller";
import { MCP_DIR, McpServersStorageService } from "./mcp.storage.service";

/** Default MCP servers dir, anchored to `apps/api/data/mcp-servers` (committed config). */
export function resolveMcpDir(): string {
  return process.env.MCP_DIR ?? dataDir("mcp-servers");
}

/** Default MCP credentials dir (gitignored), anchored to `apps/api/data/mcp-credentials`. */
export function resolveMcpCredentialsDir(): string {
  return process.env.MCP_CREDENTIALS_DIR ?? dataDir("mcp-credentials");
}

/**
 * Connected MCP servers plus their separate, gitignored credentials store. The
 * storage service + credentials store are exported so the {@link ClaudeRunCommandService}
 * can read the enabled set when building a run's `--mcp-config`.
 *
 * Imports `KbAuthModule` (not the full `KbModule`) for `KbMcpAuthService`
 * (fix round 1, F3) — the ONLY cross-module dependency `McpServersStorageService`
 * has, needed to write the current boot's `zibby-kb` RUN token into
 * `McpCredentialsStore` on seeding. `KbAuthModule` is a deliberate leaf (no
 * imports of its own) precisely so this import can't close a cycle: the full
 * `KbModule` transitively imports `ProjectsModule` → `MemoryModule` →
 * `McpModule`, which would ring straight back here. See `KbAuthModule`'s doc.
 */
@Module({
  imports: [KbAuthModule],
  controllers: [McpController],
  providers: [
    { provide: MCP_DIR, useFactory: resolveMcpDir },
    { provide: MCP_CREDENTIALS_DIR, useFactory: resolveMcpCredentialsDir },
    McpServersStorageService,
    McpCredentialsStore,
  ],
  exports: [McpServersStorageService, McpCredentialsStore],
})
export class McpModule {}
