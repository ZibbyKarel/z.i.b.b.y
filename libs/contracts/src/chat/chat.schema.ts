import { z } from "zod";

/**
 * Chat (chat-first conversational layer, replaces the Voice UI). The operator
 * talks to ZIBBY in one ongoing thread; a single `claude` turn with tool-use
 * decides whether to answer, ask, or act. Files are the source of truth: the
 * transcript is an append-only JSONL log, the live tokens stream over SSE.
 */

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

/**
 * The operator-selectable conversational personality. Only ZIBBY's *tone* changes
 * between these — the answer/ask/act governor (`CHAT_GOVERNOR_PROMPT`, guarded by
 * `chat-dispatch.eval.test`) is constant across all of them. Stored on the
 * file-backed `SystemConfig` (`chatPersona`); read at turn time so a change applies
 * to the next conversation without a restart.
 *
 * - `jarvis`  — the default butler: warm, dry wit, predictive, Czech-primary.
 * - `concise` — minimal words, no pleasantries, straight to the point.
 * - `formal`  — neutral and professional, no humour.
 */
export const ChatPersonaSchema = z.enum(["jarvis", "concise", "formal"]);
export type ChatPersona = z.infer<typeof ChatPersonaSchema>;

/**
 * A tool ZIBBY invoked mid-turn (e.g. `create_task`). Surfaced inline in the
 * transcript so a dispatch is announced, never invisible (autonomy contract).
 */
export const ChatToolEventSchema = z.object({
  name: z.string(),
  status: z.enum(["started", "ok", "error"]),
  summary: z.string().optional(),
  /** Link target into the app (e.g. `/runs` for a dispatched task). */
  href: z.string().optional(),
});
export type ChatToolEvent = z.infer<typeof ChatToolEventSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  text: z.string(),
  /** ISO-8601. */
  at: z.string(),
  toolEvents: z.array(ChatToolEventSchema).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatTranscriptSchema = z.object({
  conversationId: z.string(),
  /** Underlying `claude` CLI session id, threaded across turns via `--resume`. */
  sessionId: z.string().nullable(),
  messages: z.array(ChatMessageSchema),
});
export type ChatTranscript = z.infer<typeof ChatTranscriptSchema>;

export const SendChatMessageBodySchema = z.object({
  /** Omit to use (or create) the single active conversation. */
  conversationId: z.string().optional(),
  text: z.string().min(1),
});
export type SendChatMessageBody = z.infer<typeof SendChatMessageBodySchema>;

export const SendChatMessageResultSchema = z.object({
  conversationId: z.string(),
  /** Identifies the assistant turn; tokens for it arrive over the SSE stream. */
  turnId: z.string(),
});
export type SendChatMessageResult = z.infer<typeof SendChatMessageResultSchema>;
