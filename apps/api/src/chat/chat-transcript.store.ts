import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { type ChatMessage, ChatMessageSchema, type ChatTranscript } from "@zibby/contracts";
import {
  collisionResistantId,
  ensureDir,
  fileExists,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage";

/** DI token for the directory holding per-conversation chat transcripts. */
export const CHAT_DIR = "CHAT_DIR";

/** Sidecar meta for one conversation: the threaded `claude` session id lives here. */
interface ConversationMeta {
  conversationId: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Files-are-the-source-of-truth persistence for chat. Each conversation is an
 * append-only `<id>.jsonl` of {@link ChatMessage}s (the durable transcript) plus a
 * `<id>.meta.json` sidecar holding the `claude` CLI `sessionId` threaded across
 * turns via `--resume`. `active.json` points at the single ongoing thread (MVP is
 * one conversation; the id seam is here so branches/threads can land later).
 *
 * Append uses O_APPEND single writes (the activity-log precedent), never a
 * read-modify-rename, so concurrent turns can't clobber the transcript. Reads are
 * line-tolerant: a torn final line after a crash costs one message, not the thread.
 */
@Injectable()
export class ChatTranscriptStore {
  private readonly logger = new Logger(ChatTranscriptStore.name);

  constructor(@Inject(CHAT_DIR) private readonly dir: string) {}

  /**
   * Resolve the conversation to write to: an explicit id, else the active thread,
   * else a freshly created one (which becomes active). Always returns an id whose
   * meta sidecar exists.
   */
  async ensureConversation(conversationId?: string, now: Date = new Date()): Promise<string> {
    if (conversationId) {
      await this.ensureMeta(conversationId, now);
      return conversationId;
    }
    const active = await this.readActive();
    if (active) return active;
    const created = collisionResistantId("conv");
    await this.ensureMeta(created, now);
    await this.setActive(created);
    return created;
  }

  async appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
    await ensureDir(this.dir);
    await fs.appendFile(this.fileFor(conversationId), `${JSON.stringify(message)}\n`, "utf8");
  }

  async readTranscript(conversationId: string): Promise<ChatTranscript> {
    const meta = await this.readMeta(conversationId);
    return {
      conversationId,
      sessionId: meta?.sessionId ?? null,
      messages: await this.readMessages(conversationId),
    };
  }

  async getSessionId(conversationId: string): Promise<string | null> {
    return (await this.readMeta(conversationId))?.sessionId ?? null;
  }

  async setSessionId(
    conversationId: string,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const meta = (await this.readMeta(conversationId)) ?? this.freshMeta(conversationId, now);
    await this.writeMeta({ ...meta, sessionId, updatedAt: now.toISOString() });
  }

  /** The active (single ongoing) conversation, or null if none exists yet. */
  async readActive(): Promise<string | null> {
    const raw = await fs.readFile(this.activeFile(), "utf8").catch(() => null);
    if (raw === null) return null;
    const parsed = safeJson(raw);
    if (parsed && typeof parsed === "object" && "conversationId" in parsed) {
      const id = (parsed as { conversationId: unknown }).conversationId;
      return typeof id === "string" ? id : null;
    }
    return null;
  }

  private async setActive(conversationId: string): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.activeFile(), `${JSON.stringify({ conversationId })}\n`);
  }

  private async ensureMeta(conversationId: string, now: Date): Promise<void> {
    if (await fileExists(this.metaFile(conversationId))) return;
    await this.writeMeta(this.freshMeta(conversationId, now));
  }

  private freshMeta(conversationId: string, now: Date): ConversationMeta {
    const iso = now.toISOString();
    return { conversationId, sessionId: null, createdAt: iso, updatedAt: iso };
  }

  private async readMeta(conversationId: string): Promise<ConversationMeta | null> {
    const raw = await fs.readFile(this.metaFile(conversationId), "utf8").catch(() => null);
    if (raw === null) return null;
    const parsed = safeJson(raw);
    return parsed && typeof parsed === "object" ? (parsed as ConversationMeta) : null;
  }

  private async writeMeta(meta: ConversationMeta): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.metaFile(meta.conversationId), `${JSON.stringify(meta, null, 2)}\n`);
  }

  private async readMessages(conversationId: string): Promise<ChatMessage[]> {
    const raw = await fs.readFile(this.fileFor(conversationId), "utf8").catch(() => null);
    if (raw === null) return [];
    const out: ChatMessage[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed = ChatMessageSchema.safeParse(safeJson(line));
      if (parsed.success) out.push(parsed.data);
      else this.logger.warn(`skipped malformed chat line in ${conversationId}`);
    }
    return out;
  }

  private fileFor(conversationId: string): string {
    return path.join(this.dir, `${conversationId}.jsonl`);
  }

  private metaFile(conversationId: string): string {
    return path.join(this.dir, `${conversationId}.meta.json`);
  }

  private activeFile(): string {
    return path.join(this.dir, "active.json");
  }
}
