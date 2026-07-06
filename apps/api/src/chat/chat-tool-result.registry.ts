import { Injectable } from "@nestjs/common";
import type { TaskTarget } from "@zibby/contracts";

/**
 * The structured payload `create_task` produces, alongside the Czech confirmation
 * string the model sees. Queued here so `chat-session.service#describeTool` can
 * enrich the `ChatToolEvent` it emits with the real target/run — the model itself
 * only ever sees `text` (its behaviour is unchanged), the UI gets the structured
 * data out-of-band.
 */
export interface ChatCreateTaskMeta {
  runRef?: string;
  taskId: string;
  target: TaskTarget;
}

/**
 * In-memory, per-conversation bridge between the MCP tool handlers (which run
 * inside {@link ChatMcpController}, one stateless request per tool call) and the
 * streaming turn (`chat-session.service`, which parses the `claude` CLI's stdout
 * and only sees tool NAMES, never results). Two independent responsibilities,
 * both keyed by `conversationId`:
 *
 * 1. `create_task` results — pushed by the MCP tool handler when it calls the
 *    scheduler. Delivery is PUSH-first: `chat-session.service#runTurn` subscribes
 *    for the conversation via {@link onCreateTaskResult} for the duration of the
 *    turn, so it reacts the instant the (asynchronous, out-of-process-relative)
 *    MCP handler finishes — the ordering bug this seam exists to fix is that the
 *    `tool_use` stream line always arrives BEFORE the tool has executed, so a
 *    synchronous drain at that point sees an empty queue. When no subscriber is
 *    registered (nothing mid-turn, or a late/leftover result after the turn's own
 *    subscription already unsubscribed) the result falls back to the FIFO queue,
 *    drained by {@link drainCreateTaskResult} — kept for a turn-end sweep of
 *    stragglers and as a defensive fallback, not the common path anymore.
 * 2. The operator's explicit `@mention` target for the conversation's in-flight
 *    turn — set once by `sendMessage` before the turn starts, read (without
 *    consuming — a turn may call `create_task` more than once) by the MCP tool
 *    handler as `explicitTarget`, and cleared by the turn's `done`/`error` so a
 *    stale target never leaks into the next turn.
 *
 * Deliberately dumb: no TTL, no cross-process sharing — the chat engine is a
 * single in-process service, and a turn's lifetime is seconds, not minutes.
 */
@Injectable()
export class ChatToolResultRegistry {
  private readonly queues = new Map<string, ChatCreateTaskMeta[]>();
  private readonly explicitTargets = new Map<string, TaskTarget>();
  private readonly subscribers = new Map<string, (result: ChatCreateTaskMeta) => void>();

  /**
   * Subscribe to `create_task` results for a conversation as they are pushed —
   * called by `chat-session.service#runTurn` at the start of a turn. Only one
   * subscriber per conversation at a time (one turn in flight); a later call
   * replaces the previous one. Returns an `unsubscribe` the caller MUST invoke
   * when the turn ends, so a stale callback doesn't outlive it.
   */
  onCreateTaskResult(conversationId: string, cb: (result: ChatCreateTaskMeta) => void): () => void {
    this.subscribers.set(conversationId, cb);
    return () => {
      if (this.subscribers.get(conversationId) === cb) this.subscribers.delete(conversationId);
    };
  }

  /**
   * Deliver a `create_task` result: if a live subscriber is registered for the
   * conversation, hand it directly (skip the queue) — this is what lets the
   * session emit the "ok" tool event the moment the MCP handler finishes, instead
   * of only at the next drain. Otherwise queue it as before.
   */
  pushCreateTaskResult(conversationId: string, result: ChatCreateTaskMeta): void {
    const subscriber = this.subscribers.get(conversationId);
    if (subscriber) {
      subscriber(result);
      return;
    }
    const queue = this.queues.get(conversationId);
    if (queue) {
      queue.push(result);
    } else {
      this.queues.set(conversationId, [result]);
    }
  }

  /** Pop the oldest queued `create_task` result for the conversation, if any — the
   * turn-end sweep for stragglers left behind when nothing was subscribed. */
  drainCreateTaskResult(conversationId: string): ChatCreateTaskMeta | undefined {
    const queue = this.queues.get(conversationId);
    if (!queue || queue.length === 0) return undefined;
    const result = queue.shift();
    if (queue.length === 0) this.queues.delete(conversationId);
    return result;
  }

  /** Hold the operator's explicit routing target for the conversation's in-flight turn. */
  setExplicitTarget(conversationId: string, target: TaskTarget): void {
    this.explicitTargets.set(conversationId, target);
  }

  /** Peek the explicit target (non-destructive — a turn may consult it more than once). */
  getExplicitTarget(conversationId: string): TaskTarget | undefined {
    return this.explicitTargets.get(conversationId);
  }

  /** Discard the explicit target once its turn ends (`done`/`error`) — one-shot per turn. */
  clearExplicitTarget(conversationId: string): void {
    this.explicitTargets.delete(conversationId);
  }
}
