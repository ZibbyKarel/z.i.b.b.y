import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

const BINDINGS_FILE = "thread-bindings.json";
/** A notification a week is plenty to bind; 500 threads bound the file (oldest dropped). */
const MAX_BINDINGS = 500;

/**
 * Phase 3 — what a notification thread is about: the run/PR the operator's thread
 * reply is feedback on. `followUpTaskIds` are the tasks started FROM the thread, so
 * their own result notification is posted back into it.
 */
export const ThreadBindingSchema = z.object({
  channel: z.string().min(1),
  threadTs: z.string().min(1),
  conversationId: z.string().min(1),
  title: z.string(),
  at: z.string(),
  taskId: z.string().optional(),
  runId: z.string().optional(),
  prRef: z.string().optional(),
  branch: z.string().optional(),
  followUpTaskIds: z.array(z.string()).optional(),
});
export type ThreadBinding = z.infer<typeof ThreadBindingSchema>;

/** One chat conversation per bound thread, so each piece of work keeps its own context. */
export const threadConversationId = (threadTs: string): string => `slack-thread-${threadTs}`;

const keyOf = (channel: string, threadTs: string): string => `${channel}:${threadTs}`;

/**
 * `{channel, thread_ts} → binding`, persisted to `thread-bindings.json` (atomic rewrite,
 * cached after the first read — one process writes it). Garbage entries are skipped.
 */
export class ThreadBindingStore {
  private cache: Map<string, ThreadBinding> | null = null;

  constructor(private readonly dir: string) {}

  private async load(): Promise<Map<string, ThreadBinding>> {
    if (this.cache) return this.cache;
    const raw = safeJson(
      await fs.readFile(path.join(this.dir, BINDINGS_FILE), "utf8").catch(() => "{}"),
    );
    this.cache = new Map();
    for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const parsed = ThreadBindingSchema.safeParse(v);
      if (parsed.success) this.cache.set(k, parsed.data);
    }
    return this.cache;
  }

  private async save(map: Map<string, ThreadBinding>): Promise<void> {
    while (map.size > MAX_BINDINGS) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
    await ensureDir(this.dir);
    await writeFileAtomic(
      path.join(this.dir, BINDINGS_FILE),
      `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`,
    );
  }

  async bind(binding: ThreadBinding): Promise<void> {
    const map = await this.load();
    map.set(keyOf(binding.channel, binding.threadTs), ThreadBindingSchema.parse(binding));
    await this.save(map);
  }

  async get(channel: string, threadTs: string): Promise<ThreadBinding | null> {
    return (await this.load()).get(keyOf(channel, threadTs)) ?? null;
  }

  /** The thread a task belongs to — the one it was announced in or started from. */
  async forTask(taskId: string): Promise<ThreadBinding | null> {
    for (const b of (await this.load()).values()) {
      if (b.taskId === taskId || b.followUpTaskIds?.includes(taskId)) return b;
    }
    return null;
  }

  /** Record a task started from the thread (its result is answered in-thread). */
  async addFollowUp(channel: string, threadTs: string, taskId: string): Promise<void> {
    const map = await this.load();
    const b = map.get(keyOf(channel, threadTs));
    if (!b || b.followUpTaskIds?.includes(taskId)) return;
    map.set(keyOf(channel, threadTs), {
      ...b,
      followUpTaskIds: [...(b.followUpTaskIds ?? []), taskId],
    });
    await this.save(map);
  }
}
