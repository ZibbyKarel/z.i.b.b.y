import { Injectable } from "@nestjs/common";
import type { ChannelItem, DraftResearch } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../../shared/logging/logger.service";
import { ChannelItemStore } from "../channel-item.store";
import { ChannelTriageFlowService } from "../channel-triage-flow.service";
import { ReplyDraftService } from "./reply-draft.service";

/** Researches per sweep. Bounded so a busy backlog cannot fork a process storm. */
const MAX_PER_SWEEP = 2;

/** Attempts before an item is surfaced notify-only instead of retried. */
const MAX_ATTEMPTS = 2;

/** A `pending` marker older than this is a crashed research, not a running one. */
const STALE_PENDING_MS = 15 * 60 * 1000;

/**
 * Turns `needs-draft` items into either a parked approval carrying a REAL answer,
 * or a notify-only surface. Mirrors the `sweepOutcomes()` pattern: the watcher
 * calls {@link sweep} once per tick, and every failure is contained.
 *
 * The `draftResearch.status = "pending"` write happens BEFORE the child process
 * spawns, which is what makes the sweep idempotent across ticks — a research
 * taking minutes is simply skipped by the next tick rather than double-spawned.
 *
 * The symmetric guard is on the way out: the item is re-read after the research and
 * the result is DISCARDED unless it is still `needs-draft`. Without that, a snapshot
 * captured minutes earlier would be written back over an operator's dismissal.
 */
@Injectable()
export class ReplyDraftSweeperService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: ChannelItemStore,
    private readonly drafts: ReplyDraftService,
    private readonly flow: ChannelTriageFlowService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ReplyDraftSweeperService.name);
  }

  /** One pass over the `needs-draft` backlog. Never throws. */
  async sweep(): Promise<void> {
    const candidates = (await this.store.list({ state: "needs-draft" })).filter((i) =>
      this.isReady(i),
    );
    for (const item of candidates.slice(0, MAX_PER_SWEEP)) {
      await this.researchOne(item).catch((err: unknown) => {
        this.log.warn("reply-draft sweep failed for item (continuing)", {
          itemId: item.id,
          error: (err as Error).message,
        });
      });
    }
  }

  /** Ready = never attempted, retry budget left, or a crashed `pending` marker. */
  private isReady(item: ChannelItem): boolean {
    const r = item.draftResearch;
    if (!r) return true;
    if (r.status === "pending") return this.isStale(r);
    if (r.status === "ok") return false;
    return r.attempts < MAX_ATTEMPTS;
  }

  private isStale(r: DraftResearch): boolean {
    if (!r.startedAt) return true;
    return Date.now() - new Date(r.startedAt).getTime() > STALE_PENDING_MS;
  }

  private async researchOne(item: ChannelItem): Promise<void> {
    const attempts = (item.draftResearch?.attempts ?? 0) + 1;
    // The in-flight lock: written BEFORE the spawn, so the next tick skips this item.
    const locked: ChannelItem = {
      ...item,
      draftResearch: { status: "pending", attempts, startedAt: new Date().toISOString() },
    };
    await this.store.update(locked);

    const draft = await this.drafts.research(locked);
    const finishedAt = new Date().toISOString();

    // Research takes minutes, and `locked` has been a stale snapshot the whole time.
    // The operator can dismiss an item in that window (`POST /items/:id/dismiss` takes
    // any state), so writing the snapshot back would resurrect a retired item — and
    // then hand it to parkOrSurface, which may AUTO-SEND a Tier-2 reply on something
    // the operator explicitly killed. Re-read and bail unless the item is still ours.
    const current = await this.store.findById(item.id);
    if (current?.state !== "needs-draft") {
      this.log.debug("reply-draft research discarded: item left needs-draft", {
        itemId: item.id,
        state: current?.state ?? "deleted",
      });
      return;
    }

    if (draft) {
      const done: ChannelItem = {
        ...current,
        draftResearch: {
          status: "ok",
          attempts,
          ...(locked.draftResearch?.startedAt ? { startedAt: locked.draftResearch.startedAt } : {}),
          finishedAt,
        },
      };
      await this.store.update(done);
      await this.flow.parkOrSurface(done, done.triage, draft);
      return;
    }

    const failed: ChannelItem = {
      ...current,
      draftResearch: {
        status: "failed",
        attempts,
        ...(locked.draftResearch?.startedAt ? { startedAt: locked.draftResearch.startedAt } : {}),
        finishedAt,
        reason: "no concrete answer from the repository",
      },
    };
    await this.store.update(failed);

    // Retry budget spent → surface it for the operator rather than retrying forever.
    // No draft means NO reply approval — a filler phrase is never substituted.
    if (attempts >= MAX_ATTEMPTS) {
      await this.flow.parkOrSurface(failed, failed.triage, null);
    }
  }
}
