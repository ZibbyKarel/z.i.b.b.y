import { Injectable } from "@nestjs/common";
import type { ChatHandoff, ChatHandoffBody, ChatMessage } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { spawnClaudeCli } from "../shared/spawn-claude-cli";
import { ChatTranscriptStore } from "./chat-transcript.store";

/** At or below this many rendered characters the transcript is carried verbatim. */
export const HANDOFF_COMPACT_THRESHOLD_CHARS = 8000;

/** Compaction reads a long transcript and writes a brief — far slower than the 8s namer. */
const COMPACT_TIMEOUT_MS = 120_000;

const COMPACT_PROMPT = [
  "Compact the conversation below into a self-contained implementation brief for an",
  "autonomous agent who never saw it. Include: the goal; what was decided/agreed;",
  "constraints and rejected options; concrete names (files, paths, identifiers, code",
  "snippets) preserved VERBATIM; open questions; and the last agreed next step.",
  "Match the language of the conversation. Output markdown only, no preamble.",
].join("\n");

/**
 * "Create task" from chat: turns a conversation into a task description that carries
 * the WHOLE context, not just the last reply. Short transcripts go in verbatim; long
 * ones are compacted by a one-shot `claude -p --model sonnet` call that copies
 * {@link ClaudeCliTaskNamer}'s shape (overridable `runClaude` seam, `--output-format
 * json` envelope unwrap, the SAME `process.env.VITEST` no-spawn guard). Compaction
 * NEVER throws: on any failure the tail of the transcript (the most recent, most
 * relevant turns) is used instead, and the full JSONL path is always referenced.
 */
@Injectable()
export class ChatHandoffService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: ChatTranscriptStore,
    logger: LoggerService,
  ) {
    this.log = logger.child(ChatHandoffService.name);
  }

  /** The handoff, or null when the conversation has no messages (caller → 404). */
  async build(body: ChatHandoffBody): Promise<ChatHandoff | null> {
    const { messages } = await this.store.readTranscript(body.conversationId);
    const cut = body.upToMessageId ? messages.findIndex((m) => m.id === body.upToMessageId) : -1;
    const kept = cut === -1 ? messages : messages.slice(0, cut + 1);
    if (kept.length === 0) return null;

    const rendered = kept.map(renderMessage).join("\n\n");
    let context = rendered;
    let compacted = false;
    if (rendered.length > HANDOFF_COMPACT_THRESHOLD_CHARS) {
      const summary = await this.compact(rendered);
      if (summary) {
        context = summary;
        compacted = true;
      } else {
        context = `_(Earlier turns omitted; showing the most recent part.)_\n\n${rendered.slice(-HANDOFF_COMPACT_THRESHOLD_CHARS)}`;
      }
    }

    const transcriptPath = this.store.transcriptPath(body.conversationId);
    const text = [
      "Implement what was agreed in the ZIBBY chat conversation below.",
      "",
      `The context is the conversation${compacted ? " compacted into a brief" : ""}. If you need a detail it dropped, read the full transcript at ${transcriptPath} (JSONL, one message per line).`,
      "",
      "## Conversation context",
      "",
      context,
    ].join("\n");
    return { text, compacted, transcriptPath };
  }

  /** The compacted brief, or null on any failure (empty output, CLI error, tests). */
  private async compact(rendered: string): Promise<string | null> {
    if (process.env.VITEST) return null;
    try {
      const raw = await this.runClaude([COMPACT_PROMPT, "", "CONVERSATION:", rendered].join("\n"));
      const result = this.extractResultText(raw);
      return result && result.length > 0 ? result : null;
    } catch (err) {
      this.log.debug("handoff compaction failed", { error: (err as Error).message });
      return null;
    }
  }

  protected runClaude(prompt: string): Promise<string> {
    return spawnClaudeCli({
      args: ["-p", prompt, "--output-format", "json", "--model", "sonnet"],
      timeoutMs: COMPACT_TIMEOUT_MS,
      label: "handoff",
    });
  }

  /** Unwrap the `{ result }` envelope; a non-JSON reply is taken as the text itself. */
  private extractResultText(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    try {
      const envelope = JSON.parse(trimmed) as { result?: unknown };
      if (typeof envelope.result === "string") return envelope.result.trim();
    } catch {
      // Not JSON — treat the raw text as the candidate.
    }
    return trimmed;
  }
}

/** One markdown block per message; tool events and briefing payloads are dropped (text only). */
function renderMessage(message: ChatMessage): string {
  return `**${message.role === "user" ? "Operator" : "ZIBBY"}:** ${message.text}`;
}
