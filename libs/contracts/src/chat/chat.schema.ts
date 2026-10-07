import { z } from "zod";
import { BriefingSchema } from "../briefing/briefing.schema";
import {
  AgentTaskTargetSchema,
  AttachmentSchema,
  DepartmentTaskTargetSchema,
  TaskTargetSchema,
  WorkflowTaskTargetSchema,
} from "../tasks/task.schema";
import { CompanyIdSchema } from "../companies/company.schema";
import { ProjectIdSchema } from "../projects/project.schema";
import { SkillIdSchema } from "../skills/skill.schema";
import { TeamIdSchema } from "../teams/team.schema";

/**
 * D-020 — the restricted subset of {@link TaskTargetSchema} a chat `@mention` may
 * name: a real, dispatchable agent/workflow, or a named department — never a goal,
 * a chain, or the synthetic orchestrator (none of those are something the operator
 * "addresses" in a turn the way they address a unit that can pick up work).
 */
export const ChatMentionTargetSchema = z.discriminatedUnion("kind", [
  AgentTaskTargetSchema,
  DepartmentTaskTargetSchema,
  WorkflowTaskTargetSchema,
]);
export type ChatMentionTarget = z.infer<typeof ChatMentionTargetSchema>;

/** D-020 — at most this many units addressed in one turn. */
export const MAX_CHAT_MENTIONS = 8;

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
  name: z.string().min(1).max(256),
  status: z.enum(["started", "ok", "error"]),
  /** Correlates a `started` event with its later `ok`/`error` counterpart (the
   * `tool_use` block's id) — optional so old JSONL transcripts (no two-phase
   * emission) still parse. */
  callId: z.string().optional(),
  summary: z.string().optional(),
  /** Link target into the app (e.g. `/runs?run=<runRef>` for a dispatched task). */
  href: z.string().optional(),
  /** Routing destination the tool dispatched to (Fáze 14.2), when known. */
  target: TaskTargetSchema.optional(),
  /** The dispatched run's id (e.g. `delivery_1`), when the tool created a run. */
  runRef: z.string().optional(),
  /** The scheduler's task id for the dispatch, when known. */
  taskId: z.string().optional(),
});
export type ChatToolEvent = z.infer<typeof ChatToolEventSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  text: z.string(),
  /** ISO-8601. */
  at: z.string(),
  toolEvents: z.array(ChatToolEventSchema).optional(),
  /**
   * F8a (O6) — a butler-briefing payload riding an assistant turn: renders as a
   * distinguishable structured card (headline, "needs you" rows, department lines,
   * engagements, counters) instead of markdown prose. `role` stays "assistant" —
   * this describes WHAT is being said, not a third speaker. Optional and purely
   * additive: every transcript line persisted before this field existed simply
   * omits it and still parses unchanged (proven against a real transcript line in
   * `chat.schema.test.ts` — transcripts are append-only JSONL on disk, so a
   * schema change that broke an old line would be data loss, not styling).
   */
  briefing: BriefingSchema.optional(),
  /**
   * D-020 — the units the operator `@`-mentioned on THIS turn (0–8, restricted to
   * {@link ChatMentionTargetSchema}). Persisted only on the user's own turn — an
   * assistant reply never carries one. Optional/additive: every transcript line
   * persisted before this field existed simply omits it.
   */
  mentions: z.array(ChatMentionTargetSchema).max(MAX_CHAT_MENTIONS).optional(),
  /**
   * D-020 — the resolved attachment metadata for this turn's `attachmentSetId`
   * (never the raw files — mirrors {@link ScheduledTaskSchema.attachments} in
   * `task.schema.ts`). Persisted only on the user's own turn. Optional/additive.
   */
  attachments: z.array(AttachmentSchema).optional(),
  /**
   * D-020 — the raw attachment SET id this turn referenced, kept alongside the
   * resolved `attachments` metadata above so `ChatTranscriptStore` can act as an
   * `AttachmentSetRefProvider` for the scheduler's 24h orphan sweep (see
   * `attachment-set-ref-provider.ts`) — the resolved metadata alone carries no id
   * to exempt. Never rendered by the UI directly (the transcript shows `attachments`
   * instead). Optional/additive.
   */
  attachmentSetId: z.string().optional(),
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
  /**
   * Explicit routing destination (@mention picker, Fáze 14.2). When present it
   * bypasses the classifier for this turn's `create_task` dispatch — "explicit
   * target overrides the classifier".
   */
  target: TaskTargetSchema.optional(),
  /**
   * D-020 — every unit the operator `@`-mentioned this turn (0–8, restricted to
   * {@link ChatMentionTargetSchema}). The legacy single `target` above is still
   * accepted; the server normalises `mentions = mentions ?? (target ? [target] :
   * [])` (`ChatSessionService.sendMessage`) so an old-shaped caller (a single
   * `@mention`, Fáze 14.2) keeps working unchanged. `create_task`'s routing rule
   * (0/1/≥2 mentions) reads the NORMALISED list, never `target` directly.
   */
  mentions: z.array(ChatMentionTargetSchema).max(MAX_CHAT_MENTIONS).optional(),
  /**
   * D-020 — reuses the existing task-attachment upload (`POST
   * /api/tasks/attachments`) — there is no second upload path. `create_task`
   * forwards this straight to `TaskSchedulerService.createTask`, and the turn's
   * system prompt lists/inlines the resolved files (see `chat-attachment-prompt.ts`).
   */
  attachmentSetId: z.string().optional(),
  /**
   * Task 8: the operator's explicit team tag for THIS turn (the `@`-mention
   * picker's team row) — deliberately NOT a `TaskTarget` variant, carried as its
   * own field beside `target`. `target` answers WHO a dispatched `create_task`
   * runs as; `teamId` answers WHAT knowledge base this turn's `zibby-kb` MCP
   * tools may reach (`ChatSessionService.kbMcpUrl`), independent of whether the
   * turn also names a target. Absent means the chat KB tools reach every team
   * that has a knowledge base (`KbScopeService.rootsForChat(undefined)`).
   */
  teamId: TeamIdSchema.optional(),
  /**
   * TODO 13 — the `#`-tagged project for THIS turn. Resolved server-side
   * (unknown → 404 before anything is written); named in the turn's system prompt,
   * and its `teamId` becomes the `zibby-kb` ceiling when no `teamId` is tagged.
   */
  projectId: ProjectIdSchema.optional(),
  /** TODO 13 — the `#`-tagged company for THIS turn; resolved and named in the prompt. */
  companyId: CompanyIdSchema.optional(),
  /**
   * TODO 13 (ports PR #69) — the `/`-picked skill. Its instructions are appended to
   * `--append-system-prompt` after the governor (a chat turn runs `--tools ""`, so the
   * prompt is the only mechanism). Unknown → 404 before anything is written.
   */
  skillId: SkillIdSchema.optional(),
});
export type SendChatMessageBody = z.infer<typeof SendChatMessageBodySchema>;

export const SendChatMessageResultSchema = z.object({
  conversationId: z.string(),
  /** Identifies the assistant turn; tokens for it arrive over the SSE stream. */
  turnId: z.string(),
});
export type SendChatMessageResult = z.infer<typeof SendChatMessageResultSchema>;
