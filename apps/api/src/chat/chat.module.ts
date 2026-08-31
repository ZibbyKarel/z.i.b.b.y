import { Module } from "@nestjs/common";
import { MachineModule } from "../machine/machine.module";
import { BriefingModule } from "../briefing/briefing.module";
import { KbModule } from "../kb/kb.module";
import { MemoryModule } from "../memory/memory.module";
import { SubsystemsModule } from "../subsystems/subsystems.module";
import { TasksModule } from "../tasks/tasks.module";
import { dataDir } from "../shared/data-dir";
import { ChatController } from "./chat.controller";
import { ChatEventsService } from "./chat-events.service";
import { ChatMcpAuthGuard } from "./chat-mcp-auth.guard";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";
import { ChatMcpController } from "./chat-mcp.controller";
import { ChatSessionService } from "./chat-session.service";
import { ChatToolResultRegistry } from "./chat-tool-result.registry";
import { ChatToolsService } from "./chat-tools.service";
import { CHAT_DIR, ChatTranscriptStore } from "./chat-transcript.store";

/** Default chat dir, anchored to `apps/api/data/chat` (gitignored), overridable by env. */
export function resolveChatDir(): string {
  return process.env.CHAT_DIR ?? dataDir("chat");
}

/**
 * Chat (chat-first conversational layer, replaces the Voice UI). Owns the streaming
 * `claude` session engine, the append-only JSONL transcript store, the live token
 * event bus, and the in-process HTTP MCP tool server. Imports Tasks/Memory/Briefing
 * so the chat tools (`create_task` / `recall_memory` / `get_status`) delegate to the
 * real services. Exports the transcript store so the nightly distiller can read
 * conversations.
 *
 * Task 8 adds `KbModule` — `ChatSessionService` needs `KbMcpAuthService` (the KB
 * endpoint's per-boot CHAT token) to mount the `zibby-kb` server in its own
 * `--mcp-config`. `KbModule` re-exports the leaf `KbAuthModule` (see both modules'
 * docs), so importing it here resolves `KbMcpAuthService` without pulling in a
 * second, independently-constructed instance. `KbModule` does not import
 * `ChatModule` (directly or transitively), so this is a one-directional edge — no
 * cycle, unlike the `KbModule → ProjectsModule → MemoryModule → McpModule →
 * KbModule` ring `KbAuthModule` exists to dodge for `McpModule`/`ClaudeRunModule`.
 */
@Module({
  // SubsystemsModule (NS2 F3c) feeds the per-subsystem `get_status` lens — a
  // one-directional edge (subsystems never imports chat).
  imports: [TasksModule, MemoryModule, BriefingModule, MachineModule, SubsystemsModule, KbModule],
  controllers: [ChatController, ChatMcpController],
  providers: [
    { provide: CHAT_DIR, useFactory: resolveChatDir },
    ChatTranscriptStore,
    ChatEventsService,
    ChatSessionService,
    ChatToolsService,
    ChatToolResultRegistry,
    // Single source of truth for the per-boot MCP bearer token — injected into both
    // the guard (verifies) and ChatSessionService (propagates to the spawned CLI).
    ChatMcpAuthService,
    ChatMcpAuthGuard,
  ],
  exports: [ChatSessionService, ChatTranscriptStore],
})
export class ChatModule {}
