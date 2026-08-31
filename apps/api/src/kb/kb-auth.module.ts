import { Module } from "@nestjs/common";
import { KbMcpAuthService } from "./kb-mcp-auth.service";

/**
 * A deliberately LEAF module — no `imports` at all — holding only
 * `KbMcpAuthService` (the two per-boot `zibby-kb` bearer tokens, fix round 1's
 * F3). Split out of `KbModule` (which re-exports it, see that module's doc)
 * specifically so it can be imported by `McpModule` AND `ClaudeRunModule`
 * without creating an ES-module-level import cycle:
 *
 * `KbModule` imports `TeamsModule`/`ProjectsModule`/`ResolvedProjectModule`/
 * `AgentsModule`/`PipelinesModule`, and `ProjectsModule` transitively imports
 * `MemoryModule`, which imports `McpModule` — so `McpModule` importing the
 * FULL `KbModule` (as an earlier version of this fix did) closed a ring:
 * `KbModule → ProjectsModule → MemoryModule → McpModule → KbModule`. That
 * ring exists at plain `import` evaluation time, not just NestJS's DI graph —
 * `forwardRef` only defers a decorator's dereference of a class reference,
 * it does not stop the `import` statement itself from being evaluated, so it
 * cannot fix a real file-level cycle. Importing this leaf instead (which has
 * no imports of its own) is a dead end: `McpModule → KbAuthModule` and
 * `ClaudeRunModule → KbAuthModule` both terminate immediately, no ring.
 *
 * `ClaudeRunModule` needs this import too (not just `McpModule`) because it
 * deliberately owns its OWN `McpServersStorageService` instance rather than
 * importing `McpModule` (see that module's doc, pre-existing anti-cycle
 * design) — without importing `KbAuthModule` there too, that second instance
 * would either fail to resolve `KbMcpAuthService` at all, or — far worse if
 * it registered its own separate provider — mint a SECOND, DIFFERENT random
 * token pair than the one `KbMcpAuthGuard` actually validates against,
 * silently writing a credential the real guard would 401. NestJS dedupes a
 * module by class and treats its providers as app-wide singletons, so both
 * `McpServersStorageService` instances and `KbMcpAuthGuard` end up sharing
 * the exact SAME `KbMcpAuthService` instance as long as `KbMcpAuthService` is
 * registered in exactly ONE place (here) and never re-provided anywhere else.
 */
@Module({
  providers: [KbMcpAuthService],
  exports: [KbMcpAuthService],
})
export class KbAuthModule {}
